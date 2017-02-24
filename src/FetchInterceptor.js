import {
  ERROR_INVALID_CONFIG,
} from './const';
import {
  isResponseUnauthorized,
} from './services/http';
import TokenExpiredException from './services/TokenExpiredException';
import RetryCountExceededException from './services/RetryCountExceededException';
import AccessTokenProvider from './AccessTokenProvider';

/**
 * Provides a default implementation for intercepting fetch requests. It will try to resolve
 * unauthorized responses by renewing the access token and repeating the initial request.
 */
export default class FetchInterceptor {
  constructor(fetch) {
    // stores reference to vanilla fetch method
    this.fetch = fetch;

    this.config = {
      fetchRetryCount: 1,
      createAccessTokenRequest: null,
      shouldIntercept: null,
      shouldInvalidateAccessToken: null,
      parseAccessToken: null,
      authorizeRequest: null,
      onAccessTokenChange: null,
      onResponse: null,
    };

    this.intercept = this.intercept.bind(this);

    this.resolveIntercept = this.resolveIntercept.bind(this);
    this.fetchWithRetry = this.fetchWithRetry.bind(this);
    this.isConfigValid = this.isConfigValid.bind(this);
    this.createRequestUnit = this.createRequestUnit.bind(this);
    this.shouldIntercept = this.shouldIntercept.bind(this);
    this.authorizeRequest = this.authorizeRequest.bind(this);
    this.shouldFetch = this.shouldFetch.bind(this);
    this.fetchRequest = this.fetchRequest.bind(this);
    this.shouldInvalidateAccessToken = this.shouldInvalidateAccessToken.bind(this);
    this.invalidateAccessToken = this.invalidateAccessToken.bind(this);
    this.handleUnauthorizedRequest = this.handleUnauthorizedRequest.bind(this);
    this.handleResponse = this.handleResponse.bind(this);
  }

  /**
   * Configures fetch interceptor with given config object. All required properties can optionally
   * return a promise which will be resolved by fetch interceptor automatically.
   *
   * @param config
   *
   * (Required) Prepare fetch request for renewing new access token
   *   createAccessTokenRequest: (refreshToken) => request,
   *
   * (Required) Parses access token from access token response
   *   parseAccessToken: (response) => accessToken,
   *
   * (Required) Defines whether interceptor will intercept this request or just let it pass through
   *   shouldIntercept: (request) => boolean,
   *
   * (Required) Defines whether access token will be invalidated after this response
   *   shouldInvalidateAccessToken: (response) => boolean,
   *
   * (Required) Adds authorization for intercepted requests
   *   authorizeRequest: (request) => authorizedRequest,
   *
   * Number of retries after initial request was unauthorized
   *   fetchRetryCount: 1,
   *
   * Event invoked when access token has changed
   *   onAccessTokenChange: null,
   *
   * Event invoked when response is resolved
   *   onResponse: null,
   *
   */
  configure(config) {
    this.config = { ...this.config, ...config };

    if (!this.isConfigValid(this.config)) {
      throw new Error(ERROR_INVALID_CONFIG);
    }

    this.accessTokenProvider = new AccessTokenProvider(this.fetch, this.config);
  }

  /**
   * Authorizes fetch interceptor with given renew token
   * @param refreshToken
   * @param accessToken
   */
  authorize(refreshToken, accessToken) {
    this.accessTokenProvider.authorize(refreshToken, accessToken);
  }

  /**
   * Returns current authorization for fetch fetchInterceptor
   * @returns {{accessToken: string, refreshToken: string}}
   */
  getAuthorization() {
    return this.accessTokenProvider.getAuthorization();
  }

  /**
   * Clears authorization tokens. Call this to effectively log out user from fetch interceptor.
   */
  clear() {
    this.accessTokenProvider.clear();
  }

  /**
   * Main intercept method, you should chain this inside wrapped fetch call
   * @param args Args initially provided to fetch method
   * @returns {Promise} Promise which resolves the same way as fetch would
   */
  intercept(...args) {
    return new Promise((resolve, reject) => this.resolveIntercept(resolve, reject, ...args));
  }

  resolveIntercept(resolve, reject, ...args) {
    const request = new Request(...args);
    const { accessToken } = this.accessTokenProvider.getAuthorization();
    const requestUnit = this.createRequestUnit(request, resolve, reject);

    // if access token is not resolved yet
    if (!accessToken) {
      return this.accessTokenProvider
        .renew()
        .then(() => this.fetchWithRetry(requestUnit))
        .catch(reject);
    }

    // attempt normal fetch operation
    return this.fetchWithRetry(requestUnit)
      .catch(reject);
  }

  fetchWithRetry(requestUnit) {
    // prepare initial request unit
    return Promise.resolve(requestUnit)
      // resolve should intercept flag, when false, step is skipped
      .then(this.shouldIntercept)
      // authorize request
      .then(this.authorizeRequest)
      // last minute check if fetch should be performed
      // this is as close as it gets to canceling events since
      // fetch spec does not support cancel at the moment
      .then(this.shouldFetch)
      // perform fetch
      .then(this.fetchRequest)
      // check if response invalidates current access token
      .then(this.shouldInvalidateAccessToken)
      // perform token invalidation if neccessary
      .then(this.invalidateAccessToken)
      // handle unauthorized response by requesting a new access token and
      // repeating a request
      .then(this.handleResponse)
      .catch(this.handleUnauthorizedRequest);
  }

  createRequestUnit(request, fetchResolve, fetchReject) {
    return {
      request,
      response: null,
      shouldIntercept: false,
      shouldInvalidateAccessToken: false,
      shouldFetch: true,
      accessToken: null,
      fetchCount: 0,
      fetchResolve,
      fetchReject,
    }
  }

  shouldIntercept(requestUnit) {
    const { request } = requestUnit;
    const { shouldIntercept } = this.config;

    return Promise.resolve(shouldIntercept(request))
      .then(shouldIntercept =>
        ({ ...requestUnit, shouldIntercept })
      );
  }

  authorizeRequest(requestUnit) {
    const { shouldIntercept } = requestUnit;

    if (!shouldIntercept) {
      return requestUnit;
    }

    const { request } = requestUnit;
    const { accessToken } = this.accessTokenProvider.getAuthorization();
    const { authorizeRequest } = this.config;

    if (request && accessToken){
      return Promise.resolve(authorizeRequest(request, accessToken))
        .then(request =>
          ({ ...requestUnit, accessToken, request })
        );
    }

    return requestUnit;
  }

  shouldFetch(requestUnit) {
    const { request } = requestUnit;
    const { shouldFetch } = this.config;

    // verifies all outside conditions from config are met
    if (!shouldFetch) {
      return requestUnit;
    }

    return Promise.resolve(shouldFetch(request))
      .then(shouldFetch =>
        ({ ...requestUnit, shouldFetch })
      );
  }

  fetchRequest(requestUnit) {
    const { shouldFetch } = requestUnit;

    if (shouldFetch) {
      const { request, fetchCount } = requestUnit;
      const { fetchRetryCount } = this.config;

      // verifies that retry count has not been exceeded
      if (fetchCount > fetchRetryCount) {
        throw new RetryCountExceededException(requestUnit);
      }

      const { fetch } = this;
      return Promise.resolve(fetch(request))
        .then(response =>
          ({
            ...requestUnit,
            response,
            fetchCount: fetchCount + 1,
          })
        );
    }

    return requestUnit;
  }

  shouldInvalidateAccessToken(requestUnit) {
    const { shouldIntercept } = requestUnit;
    const { shouldInvalidateAccessToken } = this.config;

    if (shouldIntercept && shouldInvalidateAccessToken) {
      const { response } = requestUnit;
      // check if response invalidates access token
      return Promise.resolve(shouldInvalidateAccessToken(response))
        .then(shouldInvalidateAccessToken =>
          ({ ...requestUnit, shouldInvalidateAccessToken })
        );
    }

    return requestUnit;
  }

  invalidateAccessToken(requestUnit) {
    const { shouldIntercept, shouldInvalidateAccessToken } = requestUnit;

    if (shouldIntercept && shouldInvalidateAccessToken) {
      this.accessTokenProvider.renew();
    }

    return requestUnit;
  }

  handleResponse(requestUnit) {
    const { shouldIntercept, response, fetchResolve, fetchReject } = requestUnit;

    // can only be empty on network errors
    if (!response) {
      fetchReject();
      return;
    }

    if (shouldIntercept && isResponseUnauthorized(response)) {
      throw new TokenExpiredException({ ...requestUnit })
    }

    if (this.config.onResponse) {
      this.config.onResponse(response);
    }

    return fetchResolve(response);
  }

  handleUnauthorizedRequest(error) {
    // if expired token, we try to resolve it and retry operation
    if (error instanceof TokenExpiredException) {
      const { requestUnit } = error;
      const { fetchReject } = requestUnit;

      return Promise.resolve(this.accessTokenProvider.renew())
        .then(() => this.fetchWithRetry(requestUnit))
        .catch(fetchReject);
    }

    // if we failed to resolve token we just pass the last response
    if (error instanceof RetryCountExceededException) {
      const { requestUnit } = error;
      const { response, fetchResolve } = requestUnit;

      if (this.config.onResponse) {
        this.config.onResponse(response);
      }

      return fetchResolve(response);
    }

    // cannot be handled here
    throw new Error(error);
  }

  isConfigValid() {
    return this.config.shouldIntercept &&
      this.config.authorizeRequest &&
      this.config.createAccessTokenRequest &&
      this.config.parseAccessToken;
  }
}
