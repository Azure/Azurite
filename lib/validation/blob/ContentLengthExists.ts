const AError = require("./../../core/AzuriteError"),
  N = require("./../../core/HttpHeaderNames"),
  ErrorCodes = require("./../../core/ErrorCodes");

class ContentLengthExists {
  constructor() {}

  validate({ request = undefined }) {
    if (!request.httpProps[N.CONTENT_LENGTH]) {
      throw new AError(ErrorCodes.MissingContentLengthHeader);
    }
  }
}

export default new ContentLengthExists();
