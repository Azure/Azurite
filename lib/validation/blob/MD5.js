'use strict';

const crypto = require('crypto'),
    N = require('./../../model/blob/HttpHeaderNames'),
    AError = require('./../../AzuriteError'),
    ErrorCodes = require('./../../ErrorCodes');

class MD5 {
    constructor() {
    }

    validate({ request = undefined }) {
        const sourceMd5 = request.httpProps[N.CONTENT_MD5];
        const targetMd5 = request.calculateContentMd5();
        if (sourceMd5 && targetMd5 !== sourceMd5) {
            throw new AError(ErrorCodes.Md5Mismatch);
        }
    }
}

module.exports = new MD5();