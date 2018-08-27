import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

class ContentLengthExists {
  public validate(request) {
    if (!request.httpProps[N.CONTENT_LENGTH]) {
      throw new AzuriteError(ErrorCodes.MissingContentLengthHeader);
    }
  }
}

export default new ContentLengthExists();
