'use strict';

const storageManager = require('./../StorageManager'),
    PageListXmlModel = require('./../model/PageListXmlModel'),
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
                const model = this._createModel(result.pageRanges);
                res.set(new ResponseHeader({ 'x-ms-blob-content-length': result.size }));
                res.status(200).send(model.toString());
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _createModel(pageRanges) {
        const model = new PageListXmlModel();
        for (const pr of pageRanges) {
            model.addPageRange(pr.start*512, pr.end*512 - 1);
        }
        return model;
    }
}

module.exports = new GetPageRanges();