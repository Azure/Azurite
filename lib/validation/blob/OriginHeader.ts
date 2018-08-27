import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

/**
 * Validates whether the "Origin" request header is set.
 *
 * @class
 */
class OriginHeader {
  public validate(request) {
    if (!request.httpProps[N.ORIGIN]) {
      throw new AzuriteError(ErrorCodes.MissingRequiredHeader);
    }
  }
}

export default new OriginHeader();
