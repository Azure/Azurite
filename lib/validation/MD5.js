'use strict';

const crypto = require('crypto'),
    N = require('./../model/HttpHeaderNames'),
    AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes');

class MD5 {
    constructor() {
    }

    /**
     * @param {Object} options - validation input
     * @param {Object} options.request - AzuriteRequest object
     */
    validate(options) {
        const sourceMD5 = options.request.httpProps[N.CONTENT_MD5];
        const targetMD5 = crypto.createHash('md5')
            .update(options.request.body)
            .digest('base64');
        if (sourceMD5 && targetMD5 !== sourceMD5) {
            throw new AError(ErrorCodes.Md5Mismatch);
        }
    }
}

module.exports = new MD5();