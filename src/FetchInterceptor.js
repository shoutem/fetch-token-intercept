import isFunction from 'lodash/isFunction';
import { ERROR_INVALID_CONFIG } from './const';
import * as http from './services/http';
import TokenExpiredException from './services/TokenExpiredException';
import RetryCountExceededException from './services/RetryCountExceededException';
import AccessTokenProvider from './AccessTokenProvider';

/**
 * Prepares signed request object which can be used for renewing access token
 *
 * @callback createAccessTokenRequest
 * @param {string} refreshToken Refresh token used to sign the request
 * @returns {Request} Signed request object which can be used to get access token
 */

/**
 * Parses access token from access token response object
 *
 * @callback parseAccessToken
 * @param {Response} response Response object with access token
 * @returns {string} Access token parsed from response
 */

/**
 * Checks whether interceptor will intercept this request or just let it pass through
 *
 * @callback shouldIntercept
 * @param {Request} request Request object
 * @returns {bool} A value indicating whether this request should be intercepted
 */

/**
 * Checks whether provided response invalidates current access token
 *
 * @callback shouldInvalidateAccessToken
 * @param {Response} response Response object
 * @returns {bool} A value indicating whether token should be invalidated
 */

/**
 * Adds authorization for intercepted requests
 *
 * @callback authorizeRequest
 * @param {Request} request Request object being intercepted
 * @param {string} accessToken Current access token
 * @returns {Request} Authorized request object
 */

const getDefaultConfig = () => ({
  fetchRetryCount: 1,
  createAccessTokenRequest: null,
  shouldIntercept: () => false,
  shouldInvalidateAccessToken: () => false,
  isResponseUnauthorized: http.isResponseUnauthorized,
  parseAccessToken: null,
  authorizeRequest: null,
  onAccessTokenChange: null,
  onResponse: null,
});

/**
 * Request context provides a common object for storing information about request's and response's
 * results while it passes through a token interception pipeline. It's provided as input for each
 * stage method in the pipeline and can be used to store results of that stage or read results of
 * previous stages. Each stage should modify the context accordingly and simple return context
 * when it's finished.
 * @param fetchArgs
 * @param fetchResolve
 * @param fetchReject
 */
function createRequestContext(fetchArgs, fetchResolve, fetchReject) {
  return {
    request: null,
    response: null,
    shouldIntercept: false,
    shouldInvalidateAccessToken: false,
    shouldWaitForTokenRenewal: false,
    shouldFetch: true,
    accessToken: null,
    fetchCount: 0,
    fetchArgs,
    fetchResolve,
    fetchReject,
  };
}

function createRequest(requestContext) {
  const { fetchArgs } = requestContext;
  const request = new Request(...fetchArgs);

  return { ...requestContext, request };
}

/**
 * Provides a default implementation for intercepting fetch requests. It will try to resolve
 * unauthorized responses by renewing the access token and repeating the initial request.
 */
class FetchInterceptor {
  constructor(fetch) {
    // stores reference to vanilla fetch method
    this.fetch = fetch;
    this.accessTokenProvider = new AccessTokenProvider(this.fetch);

    this.config = getDefaultConfig();

    this.intercept = this.intercept.bind(this);

    this.resolveIntercept = this.resolveIntercept.bind(this);
    this.fetchWithRetry = this.fetchWithRetry.bind(this);
    this.isConfigValid = this.isConfigValid.bind(this);
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
   * @param {object} config
   * @param {createAccessTokenRequest} config.createAccessTokenRequest
   *   Prepare fetch request for renewing new access token
   * @param {parseAccessToken} config.parseAccessToken
   *   Parses access token from access token response
   * @param {shouldIntercept} config.shouldIntercept
   *   Defines whether interceptor will intercept this request or just let it pass through
   * @param {shouldInvalidateAccessToken} config.shouldInvalidateAccessToken
   *   Defines whether access token will be invalidated after this response
   * @param {authorizeRequest} config.authorizeRequest
   *   Adds authorization for intercepted requests
   * @param {function} [config.isResponseUnauthorized=null]
   *   Checks if response should be considered unauthorized (by default only 401 responses are
   *   considered unauthorized. Override this method if you need to trigger token renewal for
   *   other response statuses.
   * @param {number} [config.fetchRetryCount=1]
   *   Number of retries after initial request was unauthorized
   * @param {number} [config.onAccessTokenChange=null]
   *   Event invoked when access token has changed
   * @param {number} [config.onResponse=null]
   *   Event invoked when response is resolved
   * </pre>
   */
  configure(config) {
    this.config = { ...this.config, ...config };

    if (!this.isConfigValid(this.config)) {
      throw new Error(ERROR_INVALID_CONFIG);
    }

    this.accessTokenProvider.configure(this.config);
  }

  /**
   * Authorizes fetch interceptor with given refresh token
   * @param {string} refreshToken Refresh token
   * @param {string} accessToken Access token
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
   * Clears current authorization and restores default configuration, e.g. interceptor
   * will stop intercepting requests.
   */
  unload() {
    this.clear();
    this.config = getDefaultConfig();
  }

  /**
   * Main intercept method, you should chain this inside wrapped fetch call
   * @param args Args initially provided to fetch method
   * @returns {Promise} Promise which resolves the same way as fetch would
   */
  intercept(...args) {
    return new Promise((resolve, reject) => this.resolveIntercept(resolve, reject, ...args));
  }

  isConfigValid() {
    return this.config.shouldIntercept
      && isFunction(this.config.shouldIntercept)
      && this.config.authorizeRequest
      && isFunction(this.config.authorizeRequest)
      && this.config.isResponseUnauthorized
      && isFunction(this.config.isResponseUnauthorized)
      && this.config.createAccessTokenRequest
      && isFunction(this.config.createAccessTokenRequest)
      && this.config.parseAccessToken
      && isFunction(this.config.parseAccessToken);
  }

  resolveIntercept(resolve, reject, ...args) {
    const { accessToken } = this.accessTokenProvider.getAuthorization();
    const requestContext = createRequestContext([...args], resolve, reject);

    // if access token is not resolved yet
    if (!accessToken) {
      return this.accessTokenProvider
        .renew()
        .then(() => this.fetchWithRetry(requestContext))
        .catch(reject);
    }

    // attempt normal fetch operation
    return this.fetchWithRetry(requestContext)
      .catch(reject);
  }

  fetchWithRetry(requestContext) {
    // prepare initial request context
    return Promise.resolve(requestContext)
      // create request
      .then(createRequest)
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

  shouldIntercept(requestContext) {
    const { request } = requestContext;

    return Promise.resolve(this.config.shouldIntercept(request))
      .then(shouldIntercept => ({ ...requestContext, shouldIntercept }));
  }

  authorizeRequest(requestContext) {
    const { shouldIntercept } = requestContext;

    if (!shouldIntercept) {
      return requestContext;
    }

    const { request } = requestContext;
    const { accessToken } = this.accessTokenProvider.getAuthorization();
    const { authorizeRequest } = this.config;

    if (request && accessToken) {
      return Promise.resolve(authorizeRequest(request, accessToken))
        .then(authorizedRequest => (
          { ...requestContext, accessToken, request: authorizedRequest }
        ));
    }

    return requestContext;
  }

  shouldFetch(requestContext) {
    const { request } = requestContext;

    // verifies all outside conditions from config are met
    if (!this.config.shouldFetch) {
      return requestContext;
    }

    return Promise.resolve(this.config.shouldFetch(request))
      .then(shouldFetch => ({ ...requestContext, shouldFetch }));
  }

  fetchRequest(requestContext) {
    const { shouldFetch } = requestContext;

    if (!shouldFetch) {
      return requestContext;
    }

    const { request, fetchCount } = requestContext;
    const { fetchRetryCount } = this.config;

    // verifies that retry count has not been exceeded
    if (fetchCount > fetchRetryCount) {
      throw new RetryCountExceededException(requestContext);
    }

    const { fetch } = this;
    return Promise.resolve(fetch(request))
      .then(response => ({
        ...requestContext,
        response,
        fetchCount: fetchCount + 1,
      }));
  }

  shouldInvalidateAccessToken(requestContext) {
    const { shouldIntercept } = requestContext;

    if (!shouldIntercept) {
      return requestContext;
    }

    const { response } = requestContext;
    // check if response invalidates access token
    return Promise.resolve(this.config.shouldInvalidateAccessToken(response))
      .then(shouldInvalidateAccessToken => ({
        ...requestContext,
        shouldInvalidateAccessToken,
      }));
  }

  invalidateAccessToken(requestContext) {
    const { shouldIntercept, shouldInvalidateAccessToken } = requestContext;
    const { shouldWaitForTokenRenewal } = this.config;

    if (!shouldIntercept || !shouldInvalidateAccessToken) {
      return requestContext;
    }

    if (!shouldWaitForTokenRenewal) {
      this.accessTokenProvider.renew();
      return requestContext;
    }

    return Promise.resolve(this.accessTokenProvider.renew())
      .then(() => requestContext);
  }

  handleResponse(requestContext) {
    const {
      shouldIntercept,
      response,
      fetchResolve,
      fetchReject,
    } = requestContext;
    const { isResponseUnauthorized } = this.config;

    // can only be empty on network errors
    if (!response) {
      return fetchReject();
    }

    if (shouldIntercept && isResponseUnauthorized(response)) {
      throw new TokenExpiredException({ ...requestContext });
    }

    if (this.config.onResponse) {
      this.config.onResponse(response);
    }

    return fetchResolve(response);
  }

  handleUnauthorizedRequest(error) {
    // if expired token, we try to resolve it and retry operation
    if (error instanceof TokenExpiredException) {
      const { requestContext } = error;
      const { fetchReject } = requestContext;

      return Promise.resolve(this.accessTokenProvider.renew())
        .then(() => this.fetchWithRetry(requestContext))
        .catch(fetchReject);
    }

    // if we failed to resolve token we just pass the last response
    if (error instanceof RetryCountExceededException) {
      const { requestContext } = error;
      const { response, fetchResolve } = requestContext;

      if (this.config.onResponse) {
        this.config.onResponse(response);
      }

      return fetchResolve(response);
    }

    // cannot be handled here
    throw new Error(error);
  }
}

export default FetchInterceptor;
