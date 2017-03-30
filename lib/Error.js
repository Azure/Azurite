'use strict';

function generateErrorMessage(message, longMessage) {
    return `<?xml version="1.0" encoding="utf-8"?><Error><Code>${message}</Code><Message>${longMessage}</Message></Error>`;
}

class AzuriteError extends Error {
    constructor(message, statusCode, longMessage) {
        super(message);
        this.message = generateErrorMessage(message, longMessage || "");
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AzuriteError;