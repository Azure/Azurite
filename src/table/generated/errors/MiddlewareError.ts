import { OutgoingHttpHeaders } from "http";

export default class MiddlewareError extends Error {
  /**
   * Creates an instance of MiddlewareError.
   *
   * @param {number} statusCode HTTP response status code
   * @param {string} message Error message
   * @param {string} [statusMessage] HTTP response status message
   * @param {OutgoingHttpHeaders} [headers] HTTP response headers
   * @param {string} [body] HTTP response body
   * @param {string} [contentType] HTTP contentType
   * @memberof MiddlewareError
   */
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly statusMessage?: string,
    public readonly headers?: OutgoingHttpHeaders,
    public readonly body?: string,
    public readonly contentType?: string
  ) {
    super(message);
    // https://stackoverflow.com/questions/31626231/custom-error-class-in-typescript
    Object.setPrototypeOf(this, MiddlewareError.prototype);

    this.name = "MiddlewareError";
  }
}
