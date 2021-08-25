import autoBind from 'auto-bind';
/**
 * Provides a way for renewing access token with correct refresh token. It will automatically
 * dispatch a call to server with request provided via config. It also ensures that
 * access token is fetched only once no matter how many requests are trying to get
 * a renewed version of access token at the moment. All subsequent requests will be chained
 * to renewing fetch promise and resolved once the response is received.
 */
class AccessTokenProvider {
  constructor(fetch, config) {
    this.fetch = fetch;

    this.config = config;
    this.renewAccessTokenPromise = null;
    this.tokens = {
      refreshToken: null,
      accessToken: null,
    };

    autoBind(this);
  }

  /**
   * Configures access token provider
   */
  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Renews current access token with provided refresh token
   */
  renew() {
    // if token resolver is not authorized it should just resolve
    if (!this.isAuthorized()) {
      return Promise.resolve();
    }

    // if we are not running token promise, start it
    if (!this.renewAccessTokenPromise) {
      this.renewAccessTokenPromise = new Promise(this.resolveAccessToken);
    }

    // otherwise just return existing promise
    return this.renewAccessTokenPromise;
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
   * Returns current authorization for fetch interceptor
   * @returns {{accessToken: string, refreshToken: string}}
   */
  getAuthorization() {
    return this.tokens;
  }

  /**
   * Clears authorization tokens. Call this to effectively log out user from fetch interceptor.
   */
  clear() {
    this.tokens.accessToken = null;
    this.tokens.refreshToken = null;
  }

  isAuthorized() {
    return this.tokens.refreshToken !== null;
  }

  fetchAccessToken(tokenRequest) {
    const { fetch } = this;
    return fetch(tokenRequest);
  }

  handleFetchAccessTokenResponse(response) {
    this.renewAccessTokenPromise = null;

    if (this.config.isResponseUnauthorized(response)) {
      this.clear();
      return null;
    }

    return this.config.parseAccessToken(response);
  }

  handleAccessToken(accessToken, resolve) {
    this.tokens = { ...this.tokens, accessToken };

    if (this.config.onAccessTokenChange) {
      this.config.onAccessTokenChange(accessToken);
    }

    resolve(accessToken);
  }

  handleError(error, reject) {
    this.renewAccessTokenPromise = null;
    this.clear();

    reject(error);
  }

  resolveAccessToken(resolve, reject) {
    const { refreshToken } = this.tokens;
    const { createAccessTokenRequest } = this.config;

    return Promise.resolve(createAccessTokenRequest(refreshToken))
      .then(this.fetchAccessToken)
      .then(this.handleFetchAccessTokenResponse)
      .then(token => this.handleAccessToken(token, resolve))
      .catch(error => this.handleError(error, reject));
  }
}

export default AccessTokenProvider;
