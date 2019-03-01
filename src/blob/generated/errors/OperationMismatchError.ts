import MiddlewareError from "./MiddlewareError";

export default class OperationMismatchError extends MiddlewareError {
  public constructor() {
    super(
      500,
      "No operation provided in context, please make sure dispatchMiddleware is properly used."
    );
    this.name = "OperationMismatchError";
  }
}
