export default class TokenExpiredException extends Error {
  constructor(requestContext) {
    super('Access token has expired');
    this.requestContext = requestContext;
    this.name = this.constructor.name;

    // Use V8's native method if available, otherwise fallback
    if ("captureStackTrace" in Error) {
      Error.captureStackTrace(this, TokenExpiredException);
    } else {
      this.stack = (new Error()).stack;
    }
  }
}
