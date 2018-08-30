'use strict';

const storageManager = require('./../../core/blob/StorageManager'),
    N = require('./../../core/HttpHeaderNames'),
    AError = require('./../../core/AzuriteError');

class PutBlockList {
    constructor() {
    }

    process(request, res) {
        storageManager.putBlockList(request)
            .then((response) => {
                response.addHttpProperty(N.CONTENT_MD5, request.calculateContentMd5());
                response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new PutBlockList();