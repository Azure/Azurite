'use strict';

function X(val) {
    val = val.toLowerCase();
    val = 'x-ms-blob-' + val;
    return val;
}

class StorageItem {
    constructor(name, httpHeader, rawHeaders) {
        this.name = name;
        this.httpProps = {};
        this.metaProps = {};
        this._initProps(httpHeader || {});
        this._initMetaProps(rawHeaders || []);
    }

    // Working on rawHeaders for meta attributes to preserve casing.
    _initMetaProps(rawHeaders) {
        this.metaProps = rawHeaders.map((e, i, a) => {
            if (e.indexOf('x-ms-meta-') !== -1) {
                e = e.replace('x-ms-meta-', '');
                const o = {};
                o[e] = a[i + 1];
                return o;
            }
        }).filter((e) => {
            return e !== undefined;
        }).reduce((acc, e) => {
            const key = Object.keys(e)[0];
            acc[key] = e[key];
            return acc;
        }, {});
    }

    _initProps(httpHeader) {
        this.httpProps['Last-Modified'] = httpHeader['Last-Modified'] || new Date().toGMTString();
        this.httpProps.ETag = httpHeader.ETag || 0;
        this.httpProps['Content-Length'] = httpHeader['Content-Length'] || httpHeader['content-length'];
        // x-ms-* attributes have precedence over according HTTP-Headers
        this.httpProps['Content-Type'] = httpHeader[X('Content-Type')] || httpHeader['Content-Type'] || httpHeader['content-type'] || 'application/octet-stream';
        this.httpProps['Content-Encoding'] = httpHeader[X('Content-Encoding')] || httpHeader['Content-Encoding'] || httpHeader['content-encoding'];
        this.httpProps['Content-Disposition'] = httpHeader[X('Content-Disposition')] || httpHeader['Content-Disposition'] || httpHeader['content-disposition'];
        this.httpProps['Cache-Control'] = httpHeader[X('Cache-Control')] || httpHeader['Cache-Control'] || httpHeader['cache-control'];
        this.httpProps['Content-Language'] = httpHeader[X('Content-Language')] || httpHeader['Content-Language'] || httpHeader['content-language'];
        this.httpProps['Content-MD5'] = httpHeader[X('Content-MD5')] || httpHeader['Content-MD5'] || httpHeader['content-md5'];
        this.httpProps['Cache-Control'] = httpHeader[X('Cache-Control')] || httpHeader['Cache-Control'] || httpHeader['cache-control'];
        this.httpProps['range'] = httpHeader['x-ms-range'] || httpHeader['Range'] || httpHeader['range'] || undefined;
        this.httpProps['x-ms-range-get-content-md5'] = httpHeader['x-ms-range-get-content-md5'] || undefined;
        this.httpProps['x-ms-delete-snapshots'] = httpHeader['x-ms-delete-snapshots'] || undefined;
        this.httpProps['x-ms-lease-id'] = httpHeader['x-ms-lease-id'] || undefined;
        this.httpProps['x-ms-lease-action'] = httpHeader['x-ms-lease-action'] || undefined;
        this.httpProps['x-ms-lease-duration'] = httpHeader['x-ms-lease-duration'] || undefined;
        this.httpProps['x-ms-lease-break-period'] = httpHeader['x-ms-lease-break-period'] || undefined;
        this.httpProps['x-ms-proposed-lease-id'] = httpHeader['x-ms-proposed-lease-id'] || undefined;
        this.httpProps['If-Modified-Since'] = httpHeader['If-Modified-Since'] || httpHeader['if-modified-since'];
        this.httpProps['If-Unmodified-Since'] = httpHeader['If-Unmodified-Since'] || httpHeader['if-unmodified-since'];
        this.httpProps['If-Match'] = httpHeader['If-Match'] || httpHeader['if-match'];
        this.httpProps['If-None-Match'] = httpHeader['If-None-Match'] || httpHeader['if-none-match'];

        Object.keys(this.httpProps).forEach((key) => {
            if (this.httpProps[key] === undefined) {
                delete this.httpProps[key];
            }
        });
    }
}

module.exports = StorageItem;