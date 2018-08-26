'use strict';

function generateErrorMessage(errorCode, userMessage) {
    return `<?xml version="1.0" encoding="utf-8"?><Error><Code>${errorCode}</Code><Message>${userMessage}</Message></Error>`;
}

class AzuriteError extends Error {
    constructor(e) {
        super(e.errorCode);
        this.message = generateErrorMessage(e.errorCode, e.userMessage || "");
        this.statusCode = e.httpErrorCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

export default AzuriteError;