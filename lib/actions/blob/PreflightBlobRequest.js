'use strict';

const storageManager = require('./../../core/blob/StorageManager'),
    AzuriteResponse = require('./../../model/blob/AzuriteResponse'),
    N = require('./../../core/HttpHeaderNames');

class PreflightBlobRequest {
    constructor() {
    }

    process(req, res) {
        const response = new AzuriteResponse();
        response.addHttpProperty(N.ACCESS_CONTROL_ALLOW_ORIGIN, req.httpProps[N.ORIGIN]);
        response.addHttpProperty(N.ACCESS_CONTROL_ALLOW_METHODS, req.httpProps[N.ACCESS_CONTROL_REQUEST_METHOD]);
        response.addHttpProperty(N.ACCESS_CONTROL_ALLOW_HEADERS, req.httpProps[N.ACCESS_CONTROL_ALLOW_HEADERS]);
        response.addHttpProperty(N.ACCESS_CONTROL_MAX_AGE, req.cors.maxAgeInSeconds);
        response.addHttpProperty(N.ACCESS_CONTROL_ALLOW_CREDENTIALS, true);
        res.status(200).send();
    }
}

module.exports = new PreflightBlobRequest();