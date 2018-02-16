'use strict';

const storageManager = require('./../../core/blob/StorageManager'),
    N = require('./../../core/HttpHeaderNames');

class PreflightBlobRequest {
    constructor() {
    }

    process(azuriteRequest, res) {

        res.status(200).send();

    }
}

module.exports = new PreflightBlobRequest();