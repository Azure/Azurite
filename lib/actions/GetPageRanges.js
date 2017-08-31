'use strict';

const storageManager = require('./../StorageManager'),
    N = require('./../model/HttpHeaderNames'),
    PageListXmlModel = require('./../model/PageListXmlModel');

class GetPageRanges {
    constructor() {
    }

    process(request, res) {
        storageManager.getPageRanges(request)
            .then((response) => {
                const model = this._createModel(response.payload);
                response.addHttpProperty(N.BLOB_CONTENT_LENGTH, response.proxy.original.size);
                res.status(200).send(model.toString());
            });
    }

    _createModel(pageRanges) {
        const model = new PageListXmlModel();
        for (const pr of pageRanges) {
            model.addPageRange(pr.start * 512, pr.end * 512 - 1);
        }
        return model;
    }
}

module.exports = new GetPageRanges();