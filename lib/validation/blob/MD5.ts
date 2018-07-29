const crypto = require("crypto"),
  N = require("./../../core/HttpHeaderNames"),
  AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes");

class MD5 {
  constructor() {}

  validate({ request = undefined }) {
    const sourceMd5 = request.httpProps[N.CONTENT_MD5];
    const targetMd5 = request.calculateContentMd5();
    if (sourceMd5 && targetMd5 !== sourceMd5) {
      throw new AError(ErrorCodes.Md5Mismatch);
    }
  }
}

export default new MD5();
