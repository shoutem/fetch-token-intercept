// Uses Emscripten stategy for determining environment
export const ENVIRONMENT_IS_REACT_NATIVE = typeof navigator === 'object' && navigator.product === 'ReactNative';
export const ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function';
export const ENVIRONMENT_IS_WEB = typeof window === 'object';
export const ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';

export const ERROR_REFRESH_TOKEN_EXPIRED = 'refresh-token-expired';
export const ERROR_INVALID_CONFIG = 'invalid-config';

export const STATUS_UNAUTHORIZED = 401;
export const STATUS_OK = 200;
