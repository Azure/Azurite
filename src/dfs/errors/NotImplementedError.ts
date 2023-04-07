import Context from "../generated/Context";
import DataLakeError from "./DataLakeError";

/**
 * Create customized error types by inheriting ServerError
 *
 * @export
 * @class UnimplementedError
 * @extends {DataLakeError}
 */
export default class NotImplementedError extends DataLakeError {
  public constructor(context: Context) {
    super(
      500,
      "APINotImplemented",
      "Current API is not implemented yet. Please vote your wanted features to https://github.com/azure/azurite/issues",
      "APINotImplemented",
      "Current API is not implemented yet. Please vote your wanted features to https://github.com/azure/azurite/issues",
      context
    );
  }
}
