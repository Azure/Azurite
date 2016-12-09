'use strict';

const storageManager = require('./../StorageManager'),
    env = require('./../env'),
    request = require('request'),
    path = require('path');

class GetBlob {
    constructor() {
    }

    process(req, res, container, blob) {
        const range = req.headers['x-ms-range'] || req.headers['Range'] || undefined;
        const x_ms_range_get_content_md5 = req.headers['x-ms-range-get-content-md5'];
        // If this header is specified without the Range header, 
        // the service returns status code 400 (Bad Request).
        if (x_ms_range_get_content_md5 && !req.headers['Range']) {
            res.status(400).send();
        }
        // If this header is set to true _and_ the range exceeds 4 MB in size, 
        // the service returns status code 400 (Bad Request).
        if (x_ms_range_get_content_md5 && this._isRangeExceeded(range)) {
            res.status(400).send();
        }

        storageManager.getBlob(container, blob, range)
            .then((result) => {
                const l = path.join(container, blob);
                request(env.storageUrl(env.port, container, blob))
                    .on('response', (staticResponse) => {
                        this._addHeader(res, result, result.httpProps, result.metaProps);
                        res.writeHead(200);
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
        const pair = range.split('=').split('-');
        const startByte = parseInt(pair[0]);
        const endByte = parseInt(pair[1]);
        return endByte - startByte > 4194304;
    }

    _addHeader(res, result, httpProps, metaProps) {
        const header = {};
        Object.keys(metaProps).forEach((key) => {
            header[key] = metaProps[key];
        });
        header.ETag = result.ETag;
        header['Content-Encoding'] = httpProps['Content-Encoding'];
        header['Content-Type'] = httpProps['Content-Type'];
        header['x-ms-version'] = '2013-08-15';
        header['Last-Modified'] = httpProps.lastModified;
        header['Content-MD5'] = httpProps.ContentMD5;
        header['Accept-Ranges'] = 'bytes';
        res.set(header);
    }
}

module.exports = new GetBlob();