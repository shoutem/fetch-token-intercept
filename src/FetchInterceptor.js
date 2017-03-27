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
      shouldIntercept: () => true,
      shouldInvalidateAccessToken: () => false,
      parseAccessToken: null,
      authorizeRequest: null,
      onAccessTokenChange: null,
      onResponse: null,
    };

    this.intercept = this.intercept.bind(this);

    this.resolveIntercept = this.resolveIntercept.bind(this);
    this.fetchWithRetry = this.fetchWithRetry.bind(this);
    this.isConfigValid = this.isConfigValid.bind(this);
    this.createRequestContext = this.createRequestContext.bind(this);
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
   * Authorizes fetch interceptor with given refresh token
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

  isConfigValid() {
    return this.config.shouldIntercept &&
      this.config.authorizeRequest &&
      this.config.createAccessTokenRequest &&
      this.config.parseAccessToken;
  }

  resolveIntercept(resolve, reject, ...args) {
    const request = new Request(...args);
    const { accessToken } = this.accessTokenProvider.getAuthorization();
    const requestContext = this.createRequestContext(request, resolve, reject);

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

  /**
   * Request context provides a common object for storing information about request's and response's
   * results while it passes through a token interception pipeline. It's provided as input for each
   * stage method in the pipeline and can be used to store results of that stage or read results of
   * previous stages. Each stage should modify the context accordingly and simple return context
   * when it's finished.
   * @param request
   * @param fetchResolve
   * @param fetchReject
   */
  createRequestContext(request, fetchResolve, fetchReject) {
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

  shouldIntercept(requestContext) {
    const { request } = requestContext;
    const { shouldIntercept } = this.config;

    return Promise.resolve(shouldIntercept(request))
      .then(shouldIntercept =>
        ({ ...requestContext, shouldIntercept })
      );
  }

  authorizeRequest(requestContext) {
    const { shouldIntercept } = requestContext;

    if (!shouldIntercept) {
      return requestContext;
    }

    const { request } = requestContext;
    const { accessToken } = this.accessTokenProvider.getAuthorization();
    const { authorizeRequest } = this.config;

    if (request && accessToken){
      return Promise.resolve(authorizeRequest(request, accessToken))
        .then(request =>
          ({ ...requestContext, accessToken, request })
        );
    }

    return requestContext;
  }

  shouldFetch(requestContext) {
    const { request } = requestContext;
    const { shouldFetch } = this.config;

    // verifies all outside conditions from config are met
    if (!shouldFetch) {
      return requestContext;
    }

    return Promise.resolve(shouldFetch(request))
      .then(shouldFetch =>
        ({ ...requestContext, shouldFetch })
      );
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
      .then(response =>
        ({
          ...requestContext,
          response,
          fetchCount: fetchCount + 1,
        })
      );
  }

  shouldInvalidateAccessToken(requestContext) {
    const { shouldIntercept } = requestContext;
    const { shouldInvalidateAccessToken } = this.config;

    if (!shouldIntercept) {
      return requestContext;
    }

    const { response } = requestContext;
    // check if response invalidates access token
    return Promise.resolve(shouldInvalidateAccessToken(response))
      .then(shouldInvalidateAccessToken =>
        ({ ...requestContext, shouldInvalidateAccessToken })
      );
  }

  invalidateAccessToken(requestContext) {
    const { shouldIntercept, shouldInvalidateAccessToken } = requestContext;

    if (!shouldIntercept || !shouldInvalidateAccessToken) {
      return requestContext;
    }

    this.accessTokenProvider.renew();

    return requestContext;
  }

  handleResponse(requestContext) {
    const { shouldIntercept, response, fetchResolve, fetchReject } = requestContext;

    // can only be empty on network errors
    if (!response) {
      fetchReject();
      return;
    }

    if (shouldIntercept && isResponseUnauthorized(response)) {
      throw new TokenExpiredException({ ...requestContext })
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
