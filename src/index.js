let config = {
  refreshEndpoint: null,
};

let tokens = {
  accessToken: null,
  refreshToken: null,
};

let refreshTokenPromise = null;

// Uses Emscripten stategy for determining environment
const ENVIRONMENT_IS_REACT_NATIVE = typeof navigator === 'object' && navigator.product === 'ReactNative';
const ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function';
const ENVIRONMENT_IS_WEB = typeof window === 'object';
const ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';

const UNAUTHORIZED = 401;
const OK = 200;

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
      return interceptor(fetch, ...args);
    };
  })(env.fetch);
}

function runRefreshTokenPromise() {
  return new Promise((resolve, reject) => {
    // prepare request
    const tokenRequest = new Request(config.refreshEndpoint, {
      headers: {
        Authorization: `Bearer ${tokens.refreshToken}`,
      }
    });

    // fetch new token with refresh token
    fetch(tokenRequest)
      .then(response => {
        refreshTokenPromise = null;

        if (response.status !== OK) {
          throw new Error('Refresh token expired');
        }

        return response.json();
      })
      // save access token to local config
      .then(data => {
        tokens.accessToken = data.accessToken;
        resolve(data);
      })
      .catch(error => {
        tokens.accessToken = null;
        tokens.refreshToken = null;

        if (config.onUnauthorized) {
          config.onUnauthorized();
        }

        reject(error);
      });
  });
}

function convertToRequest(args) {
  const request = new Request(...args);
  request.id = Date.now();
  return request;
}

function addAuthHeader(request) {
  return new Request(request, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
    },
  });
}

function interceptor(fetch, ...args) {
  const request = convertToRequest(args);

  // ignore fetch to refresh endpoint
  if (request.url === config.refreshEndpoint) {
    return fetch(request);
  }

  // outer fetch promise
  return new Promise((outerResolve, outerReject) => {
    // inner promise which includes resolving access token
    const runInnerPromise = () =>
      Promise.resolve(request)
        .then(addAuthHeader)
        // initial fetch
        .then(() => fetch(request))
        .then(response => {
          // if response is not unauthorized return results
          if (response.status !== UNAUTHORIZED) {
            return response;
          }

          // check if we're already fetching the token
          if (!refreshTokenPromise) {
            refreshTokenPromise = runRefreshTokenPromise();
          }

          return refreshTokenPromise
            .then(token => addAuthHeader(request))
            // retry fetch
            .then(request => {
              return fetch(request);
            })
        })
        .then(outerResolve)
        .catch(outerReject);

    // if refresh token is currently running all incoming fetches should chain to
    // on refresh token promise
    if (refreshTokenPromise) {
      refreshTokenPromise
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
}

/**
 * Returns current authorization for fetch interceptor
 * @returns {{accessToken: string, refreshToken: string}}
 */
export function getAuthorization() {
  return tokens;
}

