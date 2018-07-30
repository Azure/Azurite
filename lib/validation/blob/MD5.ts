import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

class MD5 {
  public validate(request) {
    const sourceMd5 = request.httpProps[N.CONTENT_MD5];
    const targetMd5 = request.calculateContentMd5();
    if (sourceMd5 && targetMd5 !== sourceMd5) {
      throw new AzuriteError(ErrorCodes.Md5Mismatch);
    }
  }
}

export default new MD5();
