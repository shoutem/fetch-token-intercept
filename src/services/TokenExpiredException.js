export default function TokenExpiredException(requestUnit) {
  this.message = 'Access token has expired';
  this.requestUnit = requestUnit;

  // Use V8's native method if available, otherwise fallback
  if ("captureStackTrace" in Error) {
    Error.captureStackTrace(this, TokenExpiredException);
  } else {
    this.stack = (new Error()).stack;
  }
}

TokenExpiredException.prototype = Object.create(Error.prototype);
TokenExpiredException.prototype.name = "TokenExpiredException";
TokenExpiredException.prototype.constructor = TokenExpiredException;
