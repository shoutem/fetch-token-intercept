// Uses Emscripten stategy for determining environment
export function isReactNative() {
  return typeof navigator === 'object' && navigator.product === 'ReactNative';
}

export function isNode() {
  return typeof process === 'object' && typeof require === 'function';
}

export function isWeb() {
  return typeof window === 'object';
}

export function isWorker() {
  return typeof importScripts === 'function';
}
