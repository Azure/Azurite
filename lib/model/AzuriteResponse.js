'use strict';

const uuidV1 = require('uuid/v1'),
    N = require('./HttpHeaderNames');

class AzuriteResponse {
    constructor({ httpProps = {}, metaProps = {}, statusCode = null }) {
        this.httpProps[N.VERSION] = '2016-05-31';
        this.httpProps[N.DATE] = new Date().toGMTString();
        this.httpProps[N.CONTENT_LENGTH] = 0;
        this.httpProps[N.REQUEST_ID] = uuidV1();
        Object.keys(httpProps).forEach(key => {
            this.httpProps[key] = httpProps[key];
        });
        Object.keys(metaProps).forEach((key) => {
            this.httpProps[`x-ms-meta-${key}`] = metaProps[key];
        });
        this.statusCode = statusCode;
    }
}

module.exports = AzuriteResponse;