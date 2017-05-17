'use strict';

function X(val) {
    val = val.toLowerCase();
    val = 'x-ms-blob-' + val;
    return val;
}

class StorageItem {
    constructor(name, httpHeader) {
        this.name = name;
        this.httpProps = {};
        this.metaProps = {};
        this._initProps(httpHeader || {});
    }

    _initProps(httpHeader) {
        Object.keys(httpHeader).forEach((key) => {
            const value = httpHeader[key];
            if (key.indexOf('x-ms-meta-') !== -1) {
                key = key.replace('x-ms-meta-', '');
                this.metaProps[key] = value;
            }
        });
        this.httpProps['Last-Modified'] = httpHeader['Last-Modified'] || new Date().toGMTString();
        this.httpProps.ETag = httpHeader.ETag || 1;
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
        Object.keys(this.httpProps).forEach((key) => {
            if (this.httpProps[key] === undefined) {
                delete this.httpProps[key];
            }
        });
    }
}

module.exports = StorageItem;