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
                if (e.code === 'NO_CONTAINER' || e.code === 'NO_BLOB') {
                    res.status(404).send();
                    return;
                }
                res.status(500).send();
                throw e;
            });
    }
}

module.exports = new GetBlobProperties();