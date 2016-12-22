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
        // x-ms-* attributes have precedence over according HTTP-Headers
        this.httpProps['Content-Type'] = httpHeader[X('Content-Type')] || httpHeader['Content-Type'] || 'application/octet-stream';
        this.httpProps['Content-Encoding'] = httpHeader[X('Content-Encoding')] || httpHeader['Content-Encoding'] || 'utf8';
        this.httpProps['Content-Language'] = httpHeader[X('Content-Language')] || httpHeader['Content-Language'];
        this.httpProps['Content-MD5'] = httpHeader[X('Content-MD5')] || httpHeader['Content-MD5'];
        this.httpProps['Cache-Control'] = httpHeader[X('Cache-Control')] || httpHeader['Cache-Control'];
        Object.keys(this.httpProps).forEach((key) => {
            if (this.httpProps[key] === undefined) {
                delete this.httpProps[key];
            }
        });
    }
}

module.exports = StorageItem;