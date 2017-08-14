'use strict';

const uuidV1 = require('uuid/v1'),
    N = require('./HttpHeaderNames');

class AzuriteResponse {
    constructor({ proxy = null, payload = null }) {
        this.proxy = proxy;
        if (this.proxy) {
            this.httpProps[N.ETAG] = this.proxy.updateETag();
            this.httpProps[N.LAST_MODIFIED] = this.proxy.lastModified();
            Object.keys(this.proxy.original.metaProps).forEach((key) => {
                this.httpProps[`x-ms-meta-${key}`] = this.proxy.original.metaProps[key];
            });
        }
        this.httpProps[N.VERSION] = '2016-05-31';
        this.httpProps[N.DATE] = new Date().toGMTString();
        this.httpProps[N.CONTENT_LENGTH] = 0;
        this.httpProps[N.REQUEST_ID] = uuidV1();
        Object.keys(httpProps).forEach(key => {
            this.httpProps[key] = httpProps[key];
        });

        this.payload = payload;
    }

    addHttpProperty(key, value) {
        this.httpProps[key] = value;
    }
}

module.exports = AzuriteResponse;