'use strict';

function _generateErrorMessage(msg) {
    return `*Internal Azurite Error*: ${msg}`;
}

class InternalAzuriteError extends Error {
    constructor(msg) {
        super(msg);
        this.message = _generateErrorMessage(msg);
        Error.captureStackTrace(this, this.constructor);
    }
}

export default InternalAzuriteError;  