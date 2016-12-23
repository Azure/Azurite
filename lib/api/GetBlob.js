'use strict';

const storageManager = require('./../StorageManager'),
    env = require('./../env'),
    request = require('request'),
    ResponseHeader = require('./../model/ResponseHeader'),
    path = require('path');

class GetBlob {
    constructor() {
    }

    process(req, res, container, blob) {
        const range = req.headers['x-ms-range'] || req.headers['range'] || undefined;
        let x_ms_range_get_content_md5 = req.headers['x-ms-range-get-content-md5'];
        // If this header is specified without the Range header, 
        // the service returns status code 400 (Bad Request).
        if (x_ms_range_get_content_md5 && req.headers['range'] === undefined) {
            res.status(400).send();
            return;
        }
        // If this header is set to true _and_ the range exceeds 4 MB in size, 
        // the service returns status code 400 (Bad Request).
        if (x_ms_range_get_content_md5 && this._isRangeExceeded(range)) {
            res.status(400).send();
            return;
        }

        storageManager.getBlob(container, blob)
            .then((result) => {
                const l = path.join(container, blob);
                const body = [];
                request(this._addRequestHeader(env.storageUrl(env.port, container, blob), range))
                    .on('response', (staticResponse) => {
                        res.set(new ResponseHeader(result.httpProps, result.metaProps, { 'Accept-Ranges': 'bytes' }));
                        (range) ? res.writeHead(206) : res.writeHead(200);
                    })
                    .pipe(res);
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    res.status(404).send();
                } else {
                    res.status(500).send();
                    throw e;
                }
            });
    }

    /*
     * Checks whether the range is bigger than 4MB (which is not allowed when
     * x-ms-range-get-content-md5 is set to true ) 
     * If there is invalid data in that string, function returns false 
     * since boolean expression will contain at least one 'NaN'' in any invalid case.
     */
    _isRangeExceeded(range) {
        const pair = range.split('=')[1].split('-');
        const startByte = parseInt(pair[0]);
        const endByte = parseInt(pair[1]);
        return endByte - startByte > 4194304;
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