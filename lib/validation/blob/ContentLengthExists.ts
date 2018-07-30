constimport AError from "./../../core/AzuriteError";
  N  from "./../../core/HttpHeaderNames"),
  ErrorCodes  from "./../../core/ErrorCodes");

class ContentLengthExists {
  public validate({ request = undefined }) {
    if (!request.httpProps[N.CONTENT_LENGTH]) {
      throw new AError(ErrorCodes.MissingContentLengthHeader);
    }
  }
}

export default new ContentLengthExists();
