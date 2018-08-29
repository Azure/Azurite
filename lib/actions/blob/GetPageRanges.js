'use strict';

import storageManager from './../../core/blob/StorageManager';
import N from './../../core/HttpHeaderNames';
import PageListXmlModel from './../../xml/blob/PageListXmlModel';

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

export default new GetPageRanges();