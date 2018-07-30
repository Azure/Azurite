import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

/*
 * Checks whether the range header (and headers depending on it) are valid.
 */
class Range {
  public validate(request, blobProxy) {
    const range = request.httpProps[N.RANGE];
    const x_ms_range_get_content_md5 =
      request.httpProps[N.RANGE_GET_CONTENT_MD5];
    // If this header is specified without the Range header,
    // the service returns status code 400 (Bad Request).
    // We are using raw "range" string here since docs at
    // https://docs.microsoft.com/de-de/azure/container-instances/container-instances-orchestrator-relationship
    // do not mention x-ms-range header explictly
    if (x_ms_range_get_content_md5 && request.httpProps.range === undefined) {
      throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
    }
    // If this header is set to true _and_ the range exceeds 4 MB in size,
    // the service returns status code 400 (Bad Request).
    if (x_ms_range_get_content_md5 && this._isRangeExceeded(range)) {
      throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
    }

    if (!this._withinRange(blobProxy.original.size, range)) {
      throw new AzuriteError(ErrorCodes.InvalidRange);
    }
  }

  // See http://svn.tools.ietf.org/svn/wg/httpbis/specs/rfc7233.html for spec of HTTP Byte Ranges
  public _withinRange(blobSize, range) {
    if (range === undefined) {
      return true;
    }
    const pair = range.split("=")[1].split("-");
    const startByte = parseInt(pair[0], undefined);
    return isNaN(startByte) || startByte < blobSize;
  }

  /*
     * Checks whether the range is bigger than 4MB (which is not allowed when
     * x-ms-range-get-content-md5 is set to true )
     * If there is invalid data in that string, function returns false
     * since boolean expression will contain at least one "NaN"" in any invalid case.
     */
  public _isRangeExceeded(range) {
    if (range === undefined) {
      return false;
    }
    const pair = range.split("=")[1].split("-");
    const startByte = parseInt(pair[0], undefined);
    const endByte = parseInt(pair[1], undefined);
    return endByte - startByte > 4194304;
  }
}

export default new Range();
