'use strict';

const uuidV1 = require('uuid/v1'),
    N = require('./HttpHeaderNames'),
    EntityType = require('./../Constants').StorageEntityType;

class AzuriteResponse {
    constructor({ proxy = null, payload = null }) {
        this.httpProps = {};
        this.proxy = proxy;
        if (this.proxy) {
            this.httpProps[N.ETAG] = this.proxy.updateETag();
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
        this.httpProps[key] = value;
    }
}

module.exports = AzuriteResponse;