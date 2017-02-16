import {
  isReactNative,
  isWorker,
  isWeb,
  isNode,
} from './services/environment';
import {
  FetchInterceptor,
} from './fetchInterceptor';

const interceptors = [];

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

function attach(env) {
  if (!env.fetch) {
    throw Error('No fetch available. Unable to register fetch-token-intercept');
  }

  // for now add default interceptor
  interceptors.push(new FetchInterceptor(env.fetch));

  // monkey patch fetch
  const fetchWrapper = fetch => (...args) => interceptors[0].intercept(...args);
  env.fetch = fetchWrapper(env.fetch);
}

function configure(config) {
  interceptors[0].configure(config);
}

function authorize(...args) {
  interceptors[0].authorize(...args);
}

function getAuthorization() {
  return interceptors[0].getAuthorization();
}

function clear() {
  return interceptors[0].clear();
}

export {
  init,
  clear,
  configure,
  authorize,
  getAuthorization,
}
