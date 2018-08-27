'use strict';

import uuidV1 from 'uuid/v1';
import N from './../../core/HttpHeaderNames';

class AzuriteTableResponse {
    proxy: any;
    httpProps: {};
    payload: any;
    constructor({ proxy = undefined, payload = undefined }) {
        this.proxy = proxy;
        this.httpProps = {};
        this.httpProps[N.VERSION] = '2016-05-31';
        this.httpProps[N.DATE] = new Date().toUTCString();
        this.httpProps[N.REQUEST_ID] = uuidV1();
        this.payload = payload;
    }

    addHttpProperty(key, value) {
        if (value !== undefined) {
            this.httpProps[key] = value;
        }
    }
}

export default AzuriteTableResponse;
