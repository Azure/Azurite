'use strict';

const storageManager = require('./../../core/blob/StorageManager'),
    js2xmlparser = require('js2xmlparser');


class GetBlobServiceProperties {
    constructor() {
    }

    process(request, res) {
        storageManager.getBlobServiceProperties(request)
            .then((response) => {
                const xml = js2xmlparser.parse('StorageServiceProperties', response.payload.StorageServiceProperties || []);
                res.set(response.httpProps);
                res.status(200).send(xml);
            });
    }
}

module.exports = new GetBlobServiceProperties();
