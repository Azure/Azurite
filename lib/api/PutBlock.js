'use strict';
const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob');

class PutBlock {
    constructor() {
    }

    process(req, res, containerName, blobName, blockId) {
        const options = {
            blockId: blockId,
            contentLength: req.headers['content-length'] || req.headers['Content-Length'],
            fileName: `${containerName}-${blobName}-${blockId}`,
            parent: `${containerName}-${blobName}`,
            blob: new Blob(blobName, req.headers)
        }
        // Content-Length is required. The length of the block content in bytes. 
        // The block must be less than or equal to 4 MB in size.
        // When the length is not provided, the operation will fail with the status code 411 (Length Required).
        if (!options.contentLength) {
            res.status(411).send();
            return;
        }
        // Blocks larger than 4MB are not allowed as per specification at
        // https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/put-block
        if (options.contentLength > 4194304) {
            res.status(413).send();
        }
        storageManager.putBlock(containerName, blobName, req.body, options)
            .then((result) => {
                this._addResponseHeaders(res, result);
                res.status(201).send();
            })
            .catch((e) => {
                if (e.name === 'md5') {
                    res.status(400).send(e.message);
                } else {
                    res.status(500).send();
                    throw e;
                }
            });
    }

    _addResponseHeaders(res, props) {
        res.set({
            'ETag': props.ETag,
            'Last-Modified': props.lastModified,
            'Content-MD5': props['Content-MD5'],
            'x-ms-request-server-encrypted': false,
            'x-ms-version': '2011-08-18',
        });  
    }
}

module.exports = new PutBlock();