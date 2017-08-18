import {
  resolveEnvironment,
} from './services/environment';
import { isResponseUnauthorized } from './services/http';
import FetchInterceptor from './FetchInterceptor';

let interceptor = null;
let environment = null;

export function attach(env) {
  if (!env.fetch) {
    throw Error('No fetch available. Unable to register fetch-token-intercept');
  }

  if (interceptor) {
    throw Error('You should attach only once.');
  }

  // for now add default interceptor
  interceptor = new FetchInterceptor(env.fetch);

  // monkey patch fetch
  // eslint-disable-next-line no-unused-vars
  const fetchWrapper = fetch => (...args) => interceptor.intercept(...args);
  // eslint-disable-next-line no-param-reassign
  env.fetch = fetchWrapper(env.fetch);
}

function initialize() {
  environment = resolveEnvironment();
  if (!environment) {
    throw new Error('Unsupported environment for fetch-token-intercept');
  }

  attach(environment);
}

/**
 * Initializes and configures interceptor
 * @param config Configuration object
 * @see FetchInterceptor#configure
 */
export function configure(config) {
  if (!interceptor) {
    initialize();
  }

  interceptor.configure(config);
}

/**
 * Initializes tokens which will be used by interceptor
 * @param args
 * @see FetchInterceptor#authorize
 */
export function authorize(...args) {
  interceptor.authorize(...args);
}

/**
 * Returns current set of tokens used by interceptor
 * @returns {{accessToken: string, refreshToken: string}|*}
 */
export function getAuthorization() {
  return interceptor.getAuthorization();
}

/**
 * Clears authorization tokens from interceptor
 */
export function clear() {
  return interceptor.clear();
}

/**
 * Gets a value indicating whether interceptor is currently active
 * @returns {boolean}
 */
export function isActive() {
  return !!interceptor;
}

/**
 * Removes interceptor and restores default behaviour
 */
export function unload() {
  if (interceptor) {
    interceptor.unload();
  }
}

export {
  isResponseUnauthorized,
};

initialize();
