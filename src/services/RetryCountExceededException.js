export default function RetryCountExceededException(requestUnit) {
  this.message = 'Retry count has been exceeded';
  this.requestUnit = requestUnit;

  // Use V8's native method if available, otherwise fallback
  if ("captureStackTrace" in Error) {
    Error.captureStackTrace(this, RetryCountExceededException);
  } else {
    this.stack = (new Error()).stack;
  }
}

RetryCountExceededException.prototype = Object.create(Error.prototype);
RetryCountExceededException.prototype.name = "RetryCountExceededException";
RetryCountExceededException.prototype.constructor = RetryCountExceededException;