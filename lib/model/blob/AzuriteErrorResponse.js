'use strict';

const AzuriteResponse = require('./AzuriteResponse'),
    N = require('./../../core/HttpHeaderNames');

class AzuriteErrorResponse extends AzuriteResponse {
    constructor({ proxy = undefined, error = undefined, cors = undefined} = {}) {
        super({proxy, payload: error.message, cors});
        
        this.httpProps[N.ERROR_CODE] = error.errorCode;
        this.httpProps[N.CONTENT_TYPE] = error.messageContentType;
        this.status = error.statusCode;
    }
}

module.exports = AzuriteErrorResponse;