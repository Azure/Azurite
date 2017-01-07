'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader');

class GetBlobProperties {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        storageManager.getBlobProperties(containerName, blobName)
            .then((result) => {
                const optionalProps = {
                    'Accept-Ranges': 'bytes',
                    'x-ms-server-encrypted': false
                }
                res.set(new ResponseHeader(result.httpProps, result.metaProps, optionalProps));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new GetBlobProperties();