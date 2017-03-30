export default class RetryCountExceededException extends Error {
  constructor(requestContext) {
    super('Retry count has been exceeded');
    this.name = this.constructor.name;
    this.requestContext = requestContext;

    // Use V8's native method if available, otherwise fallback
    if ("captureStackTrace" in Error) {
      Error.captureStackTrace(this, RetryCountExceededException);
    } else {
      this.stack = (new Error()).stack;
    }
  }
}
