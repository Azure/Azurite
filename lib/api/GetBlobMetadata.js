'use strict';

const storageManager = require('./../StorageManager');

class GetBlobMetadata {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        storageManager.getBlobMetadata(containerName, blobName)
            .then((result) => {
                this._setResponseHeader(res, result);
                res.status(200).send();
            })
            .catch((e) => {
                if (e.code === 'NO_CONTAINER') {
                    res.status(404).send('Container does not exist');
                } else if (e.code === 'NO_BLOB') {
                    res.status(404).send('Blob does not exist.');
                } else {
                    res.status(500).send('Unexpected error.')
                    throw e;
                }
            });
    }

    _setResponseHeader(res, result) {
        const httpProps = result.httpProps;
        const metaProps = result.metaProps;
        const respHeader = {};
        respHeader['Last-Modified'] = httpProps['Last-Modified'];
        respHeader.ETag = httpProps.ETag;
        respHeader['x-ms-version'] = '2011-08-18';
        Object.keys(metaProps).forEach((key) => {
            respHeader[`x-ms-meta-${key}`] = metaProps[key]; 
        });
        res.set(respHeader);
    }
}

module.exports = new GetBlobMetadata();