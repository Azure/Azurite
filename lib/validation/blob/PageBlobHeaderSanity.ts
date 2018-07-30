import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

class PageBlobHeaderSanity {
  public validate(request) {
    const httpProps = request.httpProps;
    let pageWrite = httpProps[N.PAGE_WRITE];

    if (!pageWrite) {
      throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
    }

    pageWrite = pageWrite.toLowerCase();

    if (!(pageWrite === "clear" || pageWrite === "update")) {
      throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
    }

    const isClearSet = pageWrite === "clear";
    if (isClearSet && httpProps[N.CONTENT_LENGTH] !== 0) {
      throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
    }
    if (isClearSet && httpProps[N.CONTENT_MD5]) {
      throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
    }

    const range = httpProps[N.RANGE];
    // This is safe since range string has already been validated to be well-formed
    // in PageAlignment Validator.
    const parts = range.split("=")[1].split("-");
    if (!isClearSet) {
      const startByte = parseInt(parts[0], undefined);
      const endByte = parseInt(parts[1], undefined);
      if (httpProps[N.CONTENT_LENGTH] !== endByte - startByte + 1) {
        throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
      }
    }
  }
}

export default new PageBlobHeaderSanity();
