'use strict';

import storageManager from './../../core/blob/StorageManager';
import js2xmlparser from 'js2xmlparser';


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

export default new GetBlobServiceProperties();
