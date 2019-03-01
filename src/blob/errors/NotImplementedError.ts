import StorageError from "./StorageError";

/**
 * Create customized error types by inheriting ServerError
 *
 * @export
 * @class UnimplementedError
 * @extends {StorageError}
 */
export default class NotImplementedError extends StorageError {
  public constructor(requestID: string = "") {
    super(500, "APINotImplemented", "Current API is not implemented yet.", requestID);
  }
}
