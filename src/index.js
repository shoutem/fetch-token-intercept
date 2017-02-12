import { formatBearer, parseBearer } from './helpers/tokenFormatter';
import {
  ENVIRONMENT_IS_REACT_NATIVE,
  ENVIRONMENT_IS_NODE,
  ENVIRONMENT_IS_WEB,
  ENVIRONMENT_IS_WORKER,
  ERROR_REFRESH_TOKEN_EXPIRED,
  ERROR_INVALID_CONFIG,
  STATUS_UNAUTHORIZED,
  STATUS_OK,
} from './const';

let config = {
  prepareRefreshTokenRequest: null,
  shouldIntercept: null,
  getAccessTokenFromResponse: null,
  setRequestAuthorization: null,
};

let tokens = {
  accessToken: null,
  refreshToken: null,
};

let refreshAccessTokenPromise = null;

if (ENVIRONMENT_IS_REACT_NATIVE) {
  attach(global);
} else if (ENVIRONMENT_IS_WORKER) {
  attach(self);
} else if (ENVIRONMENT_IS_WEB) {
  attach(window);
} else if (ENVIRONMENT_IS_NODE) {
  attach(global);
} else {
  throw new Error('Unsupported environment for fetch-token-intercept');
}

function attach(env) {
  if (!env.fetch) {
    throw Error('No fetch available. Unable to register fetch-token-intercept');
  }

  // monkey patch fetch
  env.fetch = (function (fetch) {
    return function (...args) {
      return fetchInterceptor(fetch, ...args);
    };
  })(env.fetch);
}

function runRefreshTokenPromise() {
  return new Promise((resolve, reject) => {
    console.log('RT_START');
    // prepare request
    const tokenRequest = config.prepareRefreshTokenRequest(tokens.refreshToken);

    // fetch new token with refresh token
    fetch(tokenRequest)
      .then(response => {
        console.log('RT_END');
        refreshAccessTokenPromise = null;

        if (response.status !== STATUS_OK) {
          throw new Error(ERROR_REFRESH_TOKEN_EXPIRED);
        }

        if (!config.getAccessTokenFromResponse) {
          throw new Error(ERROR_INVALID_CONFIG);
        }

        return config.getAccessTokenFromResponse(response);
      })
      // save access token to local config
      .then(token => {
        tokens.accessToken = token;

        resolve(token);
      })
      .catch(error => {
        console.log('RT_ERR');
        tokens.accessToken = null;
        tokens.refreshToken = null;

        reject(error);
      });
  });
}

function convertToRequest(args) {
  const request = new Request(...args);
  request.id = Date.now();
  return request;
}

function shouldFetchAccessToken(request) {
  // check if we're already fetching the token
  if (refreshAccessTokenPromise) {
    return false;
  }

  const requestAccessToken = parseBearer(request.headers.authorization);
  if (requestAccessToken && requestAccessToken !== tokens.accessToken) {
    return false;
  }

  return true;
}

function fetchInterceptor(fetch, ...args) {
  const request = convertToRequest(args);

  if (!config.shouldIntercept) {
    throw new Error(ERROR_INVALID_CONFIG);
  }

  // check whether we should ignore this request
  if (!tokens.refreshToken || !config.shouldIntercept(request)) {
    return fetch(request);
  }

  // outer fetch promise
  return new Promise((outerResolve, outerReject) => {
    if (!config.setRequestAuthorization) {
      throw new Error(ERROR_INVALID_CONFIG);
    }

    // inner promise which includes resolving access token
    const runInnerPromise = () =>
      Promise.resolve(request)
        .then((request) => config.setRequestAuthorization(request, tokens.accessToken))
        // initial fetch
        .then(() => {
          console.log('REQUEST', request.path, request.headers);
          return fetch(request);
        })
        .then(response => {
          // if response is not unauthorized we don't care about it
          if (response.status !== STATUS_UNAUTHORIZED) {
            return response;
          }

          console.log('RESPONSE', response.url);
          // if we received unauthorized and current request's token is same as access token
          // we should refresh the token. otherwise we should just repeat request since
          // some other request already refreshed access token
          if (shouldFetchAccessToken(request)) {
            refreshAccessTokenPromise = runRefreshTokenPromise();
          }

          // if refresh token promise is null, it already finished before this request
          // in that case we just want to continue and repeat this request
          const returnPromise = refreshAccessTokenPromise || Promise.resolve();

          return returnPromise
            .then(() => {
              // repeat request if tokens don't match
              if (parseBearer(request.headers.authorization) !== tokens.accessToken) {
                const authorizedRequest = config.setRequestAuthorization(request, tokens.accessToken);
                console.log('RETRY', authorizedRequest.url, authorizedRequest.headers);
                return fetch(authorizedRequest);
              }
              // otherwise return initial response
              return response;
            })
            // fetching refresh token failed
            .catch(error => {
              // we return the initial response because we failed to refresh token
              if (error.message === ERROR_REFRESH_TOKEN_EXPIRED) {
                outerResolve(response);
              } else {
                // otherwise we propagate error out
                outerReject(error);
              }
            })
        })
        .then(outerResolve)
        .catch(outerReject);

    // if refresh token is currently running all incoming fetches should chain to
    // on refresh token promise
    if (refreshAccessTokenPromise) {
      refreshAccessTokenPromise
        .then(() => {
          return runInnerPromise();
        });
    }

    // otherwise attempt fetch operation
    return runInnerPromise();
  });
}

/**
 * Configures fetch token intercept
 */
export function configure(initConfig) {
  Object.assign(config, initConfig);
}

/**
 * Configures current refresh token, refresh token invalidates on rejection
 * @param refreshToken
 * @param accessToken
 */
export function authorize(refreshToken, accessToken) {
  Object.assign(tokens, { refreshToken, accessToken });
  runRefreshTokenPromise();
}

/**
 * Returns current authorization for fetch fetchInterceptor
 * @returns {{accessToken: string, refreshToken: string}}
 */
export function getAuthorization() {
  return tokens;
}

