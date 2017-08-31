'use strict';
const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler'),
    N = require('./../model/HttpHeaderNames'),
    ResponseHeader = require('./../model/ResponseHeader'),
    BlobTypes = require('./../Constants').BlobTypes,
    Blob = require('./../model/Blob');

class PutBlock extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        storageManager.putBlock(request)
            .then((response) => {
                response.addHttpProperty(N.CONTENT_MD5, request.calculateContentMd5());
                response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new PutBlock();