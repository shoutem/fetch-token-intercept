import {
  isReactNative,
  isWorker,
  isWeb,
  isNode,
} from './services/environment';
import { isResponseUnauthorized } from './services/http';
import FetchInterceptor from './FetchInterceptor';

let interceptor = null;

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

function init() {
  if (isReactNative()) {
    attach(global);
  } else if (isWorker()) {
    attach(self);
  } else if (isWeb()) {
    attach(window);
  } else if (isNode()) {
    attach(global);
  } else {
    throw new Error('Unsupported environment for fetch-token-intercept');
  }
}

export function configure(config) {
  interceptor.configure(config);
}

export function authorize(...args) {
  interceptor.authorize(...args);
}

export function getAuthorization() {
  return interceptor.getAuthorization();
}

export function clear() {
  return interceptor.clear();
}

export {
  isResponseUnauthorized,
};

init();
