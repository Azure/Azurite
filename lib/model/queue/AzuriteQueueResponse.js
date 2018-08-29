'use strict';

import uuidV1 from 'uuid/v1';
import N from './../../core/HttpHeaderNames';

class AzuriteQueueResponse {
    constructor() {
        this.httpProps = {};
        this.httpProps[N.VERSION] = '2016-05-31';
        this.httpProps[N.DATE] = new Date().toGMTString();
        this.httpProps[N.REQUEST_ID] = uuidV1();
    }

    addHttpProperty(key, value) {
        if (value !== undefined) {
            this.httpProps[key] = value;
        }
    }

    addMetaProps(metaProps) {
        Object.keys(metaProps).forEach((key) => {
            this.addHttpProperty(`x-ms-meta-${key}`, metaProps[key]);
        });
    }
}

export default AzuriteQueueResponse;
