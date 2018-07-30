const crypto  from "crypto"),
  N  from "./../../core/HttpHeaderNames"),
 import AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes");

class MD5 {
  public validate({ request = undefined }) {
    const sourceMd5 = request.httpProps[N.CONTENT_MD5];
    const targetMd5 = request.calculateContentMd5();
    if (sourceMd5 && targetMd5 !== sourceMd5) {
      throw new AError(ErrorCodes.Md5Mismatch);
    }
  }
}

export default new MD5();
