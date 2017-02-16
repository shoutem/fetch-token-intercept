import {
  isResponseUnauthorized,
} from './services/http';

export class AccessTokenProvider {
  constructor(fetch, config) {
    this.fetch = fetch;
    this.config = config;
    this.refreshAccessTokenPromise = null;
    this.tokens = {
      refreshToken: null,
      accessToken: null,
    };

    this.isAuthorized = this.isAuthorized.bind(this);
    this.refresh = this.refresh.bind(this);
    this.clear = this.clear.bind(this);

    this.resolveAccessToken = this.resolveAccessToken.bind(this);
    this.fetchToken = this.fetchToken.bind(this);
    this.handleFetchResolved = this.handleFetchResolved.bind(this);
    this.handleTokenResolved = this.handleTokenResolved.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  /**
   * Refreshes current access token with provided refresh token
   */
  refresh() {
    // if token resolver is not authorized it should just resolve
    if (!this.isAuthorized()) {
      return Promise.resolve();
    }

    // if we are not running token promise, start it
    if (!this.refreshAccessTokenPromise) {
      this.refreshAccessTokenPromise = new Promise(this.resolveAccessToken);
    }

    // otherwise just return existing promise
    return this.refreshAccessTokenPromise;
  }

  /**
   * Authorizes intercept library with given refresh token
   * @param refreshToken
   * @param accessToken
   */
  authorize(refreshToken, accessToken) {
    this.tokens = { ...this.tokens, refreshToken, accessToken };
  }

  /**
   * Returns current authorization for fetch fetchInterceptor
   * @returns {{accessToken: string, refreshToken: string}}
   */
  getAuthorization() {
    return this.tokens;
  }

  clear() {
    this.tokens.accessToken = null;
    this.tokens.refreshToken = null;
  }

  isAuthorized() {
    return this.tokens.refreshToken !== null;
  }

  fetchToken(tokenRequest) {
    return this.fetch(tokenRequest);
  }

  handleFetchResolved(response) {
    this.refreshAccessTokenPromise = null;

    if (isResponseUnauthorized(response)) {
      this.clear();
      return null;
    }

    return this.config.parseAccessToken(response);
  }

  handleTokenResolved(token, resolve) {
    this.tokens.accessToken = token;

    if (this.config.onAccessTokenChange) {
      this.config.onAccessTokenChange(token);
    }

    resolve(token);
  }

  handleError(error, reject) {
    this.refreshAccessTokenPromise = null;
    this.clear();

    reject(error);
  }

  resolveAccessToken(resolve, reject) {
    return Promise.resolve(this.config.createAccessTokenRequest(this.tokens.refreshToken))
      .then(this.fetchToken)
      .then(this.handleFetchResolved)
      .then(token => this.handleTokenResolved(token, resolve))
      .catch(error => this.handleError(error, reject));
  }
}
