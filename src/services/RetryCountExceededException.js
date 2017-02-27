export default class RetryCountExceededException extends Error {
  constructor(requestUnit) {
    super('Retry count has been exceeded');
    this.name = this.constructor.name;
    this.requestUnit = requestUnit;

    // Use V8's native method if available, otherwise fallback
    if ("captureStackTrace" in Error) {
      Error.captureStackTrace(this, RetryCountExceededException);
    } else {
      this.stack = (new Error()).stack;
    }
  }
}
