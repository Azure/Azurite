'use strict';

const storageManager = require('./../StorageManager'),
    env = require('./../env'),
    request = require('request'),
    fs = require("fs-extra"),
    crypto = require('crypto'),
    ResponseHeader = require('./../model/ResponseHeader'),
    path = require('path'),
    Blob = require('./../model/Blob');

class GetBlob {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const range = req.headers['x-ms-range'] || req.headers['range'] || undefined;
        const blob = new Blob(blobName, req.headers);
        if (req.query.snapshot) {
            blob.setSnapshotDate(req.query.snapshot);
        }
        storageManager.getBlob(containerName, blob)
            .then((result) => {
                // If x-ms-range-get-content-md5 is specified together with the range attribute we load the entire data range into memory
                // in order to compute the MD5 hash of this chunk. We cannot use piping in this case since we cannot modify the HTTP headers
                // anymore once the response stream has started to get delivered.
                // Otherwise we just pipe the result through to the client which is more performant.
                if (range && req.headers['x-ms-range-get-content-md5']) {
                    const pair = range.split('=')[1].split('-'),
                        startByte = parseInt(pair[0]),
                        endByte = parseInt(pair[1]);

                    // Fixme: Depending on whether the blob refers to a virtual directory or a snapshot the path differs.
                    //        We need the same mechanism that we use for storage url (see env.storageUrl) for workspace directory.
                    const fullPath = path.join(env.localStoragePath, containerName, blobName);
                    const readStream = fs.createReadStream(fullPath, {
                        flags: 'r',
                        start: startByte,
                        end: endByte,
                        encoding: 'utf8'
                    });
                    readStream.read();
                    const data = [];
                    readStream.on('data', (chunk) => {
                        data.push(chunk);
                    });
                    readStream.on('end', () => {
                        const body = new Buffer(data, 'utf8');
                        result.httpProps['Content-MD5'] =
                            crypto.createHash('md5')
                                .update(body)
                                .digest('base64');
                        res.set(new ResponseHeader(result.httpProps, result.metaProps, { 'Accept-Ranges': 'bytes' }));
                        res.status(206).send(body);
                    });
                } else {
                    request(this._addRequestHeader(env.storageUrl(env.port, containerName, blob), range))
                        .on('response', (staticResponse) => {
                            result.httpProps['Content-Length'] = staticResponse.headers['content-length'];
                            if (range) {
                                delete result.httpProps['Content-MD5'];
                                result.httpProps['Content-Range'] = staticResponse.headers['content-range'];
                            }
                            res.set(new ResponseHeader(result.httpProps, result.metaProps, { 'Accept-Ranges': 'bytes' }));
                            (range) ? res.writeHead(206) : res.writeHead(200);
                        })
                        .pipe(res);
                }
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