'use strict';

const uuidV1 = require('uuid/v1'),
    N = require('./../../core/HttpHeaderNames'),
    EntityType = require('./../../core/Constants').StorageEntityType;

class AzuriteResponse {
    constructor({ proxy = undefined, payload = undefined, query = {} }) {
        this.httpProps = {};
        this.proxy = proxy;
        if (this.proxy) {
            this.httpProps[N.ETAG] = this.proxy.original.etag;
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
        this.httpProps[N.DATE] = new Date().toGMTString();
        this.httpProps[N.CONTENT_LENGTH] = 0;
        this.httpProps[N.REQUEST_ID] = uuidV1();
        this.payload = payload;
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

module.exports = AzuriteResponse;