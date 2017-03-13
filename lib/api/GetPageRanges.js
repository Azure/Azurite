'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    BlobTypes = require('./../Constants').BlobTypes,
    Blob = require('./../model/Blob');

class GetPageRanges {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers, BlobTypes.PageBlob);
        storageManager.getPageRanges(containerName, blob)
            .then((result) => {
                res.set(new ResponseHeader(result.httpProps, result.metaProps));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _createModel(raw) {
        
    }
}

module.exports = new GetPageRanges();