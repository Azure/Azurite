import MiddlewareError from "./MiddlewareError";

export default class UnsupportedRequestError extends MiddlewareError {
  public constructor() {
    super(
      400,
      "Incoming URL doesn't match any of swagger defined request patterns."
    );
    this.name = "UnsupportedRequestError";
  }
}
