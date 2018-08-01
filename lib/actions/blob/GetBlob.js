'use strict';

import storageManager from './../../core/blob/StorageManager';
import N from './../../core/HttpHeaderNames';
import { StorageEntityType as EntityType } from './../../core/Constants';
import env from './../../core/env';
import req from 'request';
import fs from 'fs-extra';
import crypto from 'crypto';

class GetBlob {
    constructor() {
    }

    process(request, res) {
        const range = request.httpProps[N.RANGE];
        storageManager.getBlob(request)
            .then((response) => {
                response.addHttpProperty(N.ACCEPT_RANGES, 'bytes');
                response.addHttpProperty(N.BLOB_TYPE, response.proxy.original.entityType);
                response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
                response.addHttpProperty(N.CONTENT_TYPE, response.proxy.original.contentType);
                // response.addHttpProperty(N.CONTENT_MD5, response.proxy.original.md5);
                response.addHttpProperty(N.CONTENT_LANGUAGE, response.proxy.original.contentLanguage);
                response.addHttpProperty(N.CONTENT_ENCODING, response.proxy.original.contentEncoding);
                response.addHttpProperty(N.CONTENT_DISPOSITION, response.proxy.original.contentDisposition);
                response.addHttpProperty(N.CACHE_CONTROL, response.proxy.original.cacheControl);
                if (request.auth) response.sasOverrideHeaders(request.query);

                // If x-ms-range-get-content-md5 is specified together with the range attribute we load the entire data range into memory
                // in order to compute the MD5 hash of this chunk. We cannot use piping in this case since we cannot modify the HTTP headers
                // anymore once the response stream has started to get delivered.
                // Otherwise we just pipe the result through to the client which is more performant.
                if (range && request.httpProps[N.RANGE_GET_CONTENT_MD5]) {
                    const pair = range.split('=')[1].split('-'),
                        startByte = parseInt(pair[0]),
                        endByte = parseInt(pair[1]);

                    const fullPath = env.diskStorageUri(request.id);
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
                        res.set(response.httpProps);
                        res.status(206).send(body);
                    });
                } else {
                    req(this._createRequestHeader(env.webStorageUri(request.id), range))
                        .on('response', (staticResponse) => {
                            response.addHttpProperty(N.CONTENT_LENGTH, staticResponse.headers[N.CONTENT_LENGTH]);
                            if (range) {
                                response.httpProps[N.BLOB_CONTENT_MD5] = response.httpProps[N.CONTENT_MD5];
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

export default new GetBlob();