/** @format */

"use strict";

import crypto from 'crypto';
import N from './../../core/HttpHeaderNames';
import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

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
