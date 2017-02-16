import {
  ERROR_INVALID_CONFIG,
  ERROR_REFRESH_TOKEN_EXPIRED,
} from '../lib/const';
import {
  isResponseUnauthorized,
} from './services/http';
import { AccessTokenProvider } from './accessTokenProvider';

export class FetchInterceptor {
  constructor(fetch) {
    // stores reference to vanilla fetch method
    this.fetch = fetch;
    this.config = {
      createAccessTokenRequest: null,
      shouldIntercept: null,
      shouldInvalidateAccessToken: null,
      parseAccessToken: null,
      authorizeRequest: null,
      onAccessTokenChange: null,
    };

    this.isConfigValid = this.isConfigValid.bind(this);
    this.fetchWithRetry = this.fetchWithRetry.bind(this);
    this.intercept = this.intercept.bind(this);
    this.resolveIntercept = this.resolveIntercept.bind(this);

    this.createRequestUnit = this.createRequestUnit.bind(this);
    this.shouldIntercept = this.shouldIntercept.bind(this);
    this.authorizeRequest = this.authorizeRequest.bind(this);
    this.fetchRequest = this.fetchRequest.bind(this);
    this.shouldInvalidateAccessToken = this.shouldInvalidateAccessToken.bind(this);
    this.invalidateAccessToken = this.invalidateAccessToken.bind(this);
    this.handleUnauthorizedRequest = this.handleUnauthorizedRequest.bind(this);
  }

  /**
   * Configures fetch interceptor with given config object
   * @param initConfig
   */
  configure(initConfig) {
    this.config = { ...this.config, ...initConfig };

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

  clear() {
    this.accessTokenProvider.clear();
  }

  intercept(...args) {
    return new Promise((resolve, reject) => this.resolveIntercept(resolve, reject, ...args));
  }

  resolveIntercept(resolve, reject, ...args) {
    const request = new Request(...args);
    const { accessToken } = this.accessTokenProvider.getAuthorization();

    // if access token is not resolved yet
    if (!accessToken) {
      return this.accessTokenProvider
        .refresh()
        .then(() => this.fetchWithRetry(request, resolve, reject))
        .catch(reject);
    }

    // attempt normal fetch operation
    return this.fetchWithRetry(request, resolve, reject)
      .catch(reject);
  }

  fetchWithRetry(request, outerResolve, outerReject) {
    return Promise.resolve(this.createRequestUnit(request))
      .then(this.shouldIntercept)
      // authorize request
      .then(this.authorizeRequest)
      // initial fetch
      .then(this.fetchRequest)
      .then(this.shouldInvalidateAccessToken)
      .then(this.invalidateAccessToken)
      .then(this.handleUnauthorizedRequest)
      .then(requestUnit => {
        const { response } = requestUnit;
        // can only be empty on network errors
        if (!response) {
          outerReject();
          return;
        }
        outerResolve(response);
      })
      .catch(outerReject);
  }

  createRequestUnit(request) {
    return {
      request,
      response: null,
      shouldIntercept: false,
      shouldInvalidateAccessToken: false,
      accessToken: null,
    }
  }

  shouldIntercept(requestUnit) {
    const { request } = requestUnit;

    return Promise.all([requestUnit, this.config.shouldIntercept(request)])
      .then(([requestUnit, shouldIntercept]) =>
        ({ ...requestUnit, shouldIntercept })
      );
  }

  authorizeRequest(requestUnit) {
    const { shouldIntercept } = requestUnit;

    if (shouldIntercept) {
      const { request } = requestUnit;
      const { accessToken } = this.accessTokenProvider.getAuthorization();

      if (request && accessToken){
        return Promise.all([
          requestUnit,
          accessToken,
          this.config.authorizeRequest(request, accessToken),
        ]).then(([requestUnit, accessToken, request]) =>
          ({ ...requestUnit, accessToken, request })
        );
      }
    }

    return requestUnit;
  }

  fetchRequest(requestUnit) {
    const { shouldIntercept } = requestUnit;

    if (shouldIntercept) {
      const { request } = requestUnit;
      return Promise.all([requestUnit, this.fetch(request)])
        .then(([requestUnit, response]) =>
          ({...requestUnit, response})
        );
    }

    return requestUnit;
  }

  shouldInvalidateAccessToken(requestUnit) {
    const { shouldIntercept } = requestUnit;

    if (shouldIntercept && this.config.shouldInvalidateAccessToken) {
      const { response } = requestUnit;
      // check if response invalidates access token
      return Promise.all([
        requestUnit,
        this.config.shouldInvalidateAccessToken(response),
      ]).then(([requestUnit, shouldInvalidateAccessToken]) =>
        ({ ...requestUnit, shouldInvalidateAccessToken })
      );
    }

    return requestUnit;
  }

  invalidateAccessToken(requestUnit) {
    const { shouldIntercept, shouldInvalidateAccessToken } = requestUnit;

    if (shouldIntercept && shouldInvalidateAccessToken) {
      this.accessTokenProvider.refresh();
    }

    return requestUnit;
  }

  handleUnauthorizedRequest(requestUnit) {
    const { shouldIntercept } = requestUnit;

    if (shouldIntercept) {
      const { response } = requestUnit;

      // we only care for unauthorized responses
      if (isResponseUnauthorized(response)) {
        return Promise.all([requestUnit, this.accessTokenProvider.refresh()])
          .then(([requestUnit, accessToken]) => ({
            ...requestUnit,
            accessToken,
            shouldIntercept: !!accessToken,
          }))
          .then(this.authorizeRequest)
          .then(this.fetchRequest)
          .catch(error => new Error(error));
      }
    }

    return requestUnit;
  }

  isConfigValid() {
    return this.config.shouldIntercept &&
      this.config.authorizeRequest &&
      this.config.createAccessTokenRequest &&
      this.config.parseAccessToken;
  }
}
