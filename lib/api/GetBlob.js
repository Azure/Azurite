'use strict';

const storageManager = require('./../StorageManager'),
    env = require('./../env'),
    request = require('request'),
    ResponseHeader = require('./../model/ResponseHeader'),
    path = require('path'),
    Blob = require('./../model/Blob');

class GetBlob {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const range = req.headers['x-ms-range'] || req.headers['range'] || undefined;
        const blob = new Blob(blobName, req.headers);
        storageManager.getBlob(containerName, blob)
            .then((result) => {
                const l = path.join(containerName, blob.name);
                const body = [];
                request(this._addRequestHeader(env.storageUrl(env.port, containerName, blob.name), range))
                    .on('response', (staticResponse) => {
                        res.set(new ResponseHeader(result.httpProps, result.metaProps, { 'Accept-Ranges': 'bytes' }));
                        (range) ? res.writeHead(206) : res.writeHead(200);
                    })
                    .pipe(res);
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _addRequestHeader(url, range) {
        const request = {};
        request.headers = {};
        request.url = url;
        if (range) {
            request.headers.Range = range
        }
        return request;
    }
}

module.exports = new GetBlob();