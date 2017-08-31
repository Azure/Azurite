'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler'),
    N = require('./../model/HttpHeaderNames'),
    env = require('./../env'),
    req = require('request'),
    fs = require("fs-extra"),
    crypto = require('crypto');

class GetBlob extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        const range = request.httpProps[N.RANGE];
        storageManager.getBlob(request)
            .then((response) => {
                response.addHttpProperty(N.ACCEPT_RANGES, 'bytes');
                response.addHttpProperty(N.BLOB_TYPE, request.entityType);
                response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);

                // If x-ms-range-get-content-md5 is specified together with the range attribute we load the entire data range into memory
                // in order to compute the MD5 hash of this chunk. We cannot use piping in this case since we cannot modify the HTTP headers
                // anymore once the response stream has started to get delivered.
                // Otherwise we just pipe the result through to the client which is more performant.
                if (range && request.httpProps[N.RANGE_GET_CONTENT_MD5]) {
                    const pair = range.split('=')[1].split('-'),
                        startByte = parseInt(pair[0]),
                        endByte = parseInt(pair[1]);

                    const fullPath = env.diskStorageUri(request);
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
                        const hash = crypto.createHash('md5')
                            .update(body)
                            .digest('base64');
                        response.addHttpProperty(N.CONTENT_MD5, hash);
                        res.set(request.httpProps);
                        res.status(206).send(body);
                    });
                } else {
                    req(this._createRequestHeader(env.webStorageUri(env.port, request), range))
                        .on('response', (staticResponse) => {
                            response.addHttpProperty(N.CONTENT_LENGTH, staticResponse.headers[N.CONTENT_LENGTH]);
                            if (range) {
                                delete response.httpProps[N.CONTENT_MD5];
                                response.httpProps[N.CONTENT_RANGE] = staticResponse.headers[N.CONTENT_RANGE];
                            }
                            res.set(response.httpProps);
                            (range) ? res.writeHead(206) : res.writeHead(200);
                        })
                        .pipe(res);
                }
            });
    }

    _createRequestHeader(url, range) {
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