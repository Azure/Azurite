const AError = from "./../../core/AzuriteError"),
  N = from "./../../core/HttpHeaderNames"),
  ErrorCodes = from "./../../core/ErrorCodes");

/**
 * Validates whether the "Origin" request header is set.
 *
 * @class
 */
class OriginHeader {
  public validate({ request = undefined }) {
    if (!request.httpProps[N.ORIGIN]) {
      throw new AError(ErrorCodes.MissingRequiredHeader);
    }
  }
}

export default new OriginHeader();
