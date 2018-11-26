/** @format */

"use strict";

const N = require('./HttpHeaderNames');

function generateErrorMessage(errorCode, userMessage) {
  return `<?xml version="1.0" encoding="utf-8"?><Error><Code>${errorCode}</Code><Message>${userMessage}</Message></Error>`;
}

class AzuriteError extends Error {
    constructor(e) {
        super(generateErrorMessage(e.errorCode, e.userMessage || ""));
        this.errorCode = e.errorCode;
        this.statusCode = e.httpErrorCode;
        this.messageContentType = 'application/xml';
        Error.captureStackTrace(this, this.constructor);
    }

    send(res) {
        res.status(this.statusCode)
            .set(N.ERROR_CODE, this.errorCode)
            .type(this.messageContentType)
            .send(this.message);
    }
}

module.exports = AzuriteError;
