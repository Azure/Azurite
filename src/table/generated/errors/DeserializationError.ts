import MiddlewareError from "./MiddlewareError";

export default class DeserializationError extends MiddlewareError {
  public constructor(message: string) {
    super(400, message);
    this.name = "DeserializationError";
  }
}
