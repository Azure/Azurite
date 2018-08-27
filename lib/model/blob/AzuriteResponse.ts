'use strict';

import uuidV1 from 'uuid/v1';
import N from './../../core/HttpHeaderNames';
import { StorageEntityType as EntityType } from './../../core/Constants';

class AzuriteResponse {
    nextMarker: any;
    httpProps: {};
    proxy: any;
    payload: any;
    constructor({ proxy = undefined, payload = undefined, query = {}, cors = undefined } = {}) {
        this.httpProps = {};
        this.proxy = proxy;
        if (this.proxy) {
            this.httpProps[N.ETAG] = `\"${this.proxy.original.etag}\"`;
            this.httpProps[N.LAST_MODIFIED] = this.proxy.lastModified();
            Object.keys(this.proxy.original.metaProps).forEach((key) => {
                this.httpProps[`x-ms-meta-${key}`] = this.proxy.original.metaProps[key];
            });

            if (proxy.original.entityType === EntityType.AppendBlob) {
                this.httpProps[N.BLOB_COMMITTED_BLOCK_COUNT] = proxy.original[N.BLOB_COMMITTED_BLOCK_COUNT];
                this.httpProps[N.BLOB_APPEND_OFFSET] = proxy.original.size;
            }

            if (proxy.original.entityType === EntityType.PageBlob) {
                this.httpProps[N.SEQUENCE_NUMBER] = proxy.original.sequenceNumber;
            }
        }
        this.httpProps[N.VERSION] = '2016-05-31';
        this.httpProps[N.DATE] = new Date().toUTCString();
        this.httpProps[N.CONTENT_LENGTH] = 0;
        this.httpProps[N.REQUEST_ID] = uuidV1();
        this.payload = payload;

        if (cors !== undefined) {
            this.httpProps[N.ACCESS_CONTROL_ALLOW_ORIGIN] = cors.origin;
            this.httpProps[N.ACCESS_CONTROL_EXPOSE_HEADERS] = cors.exposedHeaders;
            this.httpProps[N.ACCESS_CONTROL_ALLOW_CREDENTIALS] = true;
            this.httpProps[N.ACCESS_CONTROL_ALLOW_HEADERS] = cors.exposedHeaders;
        }
    }

    addHttpProperty(key, value) {
        if (value !== undefined) {
            this.httpProps[key] = value;
        }
    }

    sasOverrideHeaders(query) {
        this.addHttpProperty(N.CACHE_CONTROL, query.rscc);
        this.addHttpProperty(N.CONTENT_DISPOSITION, query.rscd);
        this.addHttpProperty(N.CONTENT_ENCODING, query.rsce);
        this.addHttpProperty(N.CONTENT_LANGUAGE, query.rscl);
        this.addHttpProperty(N.CONTENT_TYPE, query.rsct);
    }
}

export default AzuriteResponse;