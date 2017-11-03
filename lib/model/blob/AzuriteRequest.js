'use strict';

const crypto = require('crypto'),
    N = require('./../../core/HttpHeaderNames'),
    EntityType = require('./../../core/Constants').StorageEntityType,
    etag = require('./../../core/utils'),
    InternalAzuriteError = require('./../../core/InternalAzuriteError');

class AzuriteRequest {
    constructor({
        req = undefined,
        entityType = undefined,
        payload = undefined }) {

        if (req === undefined) {
            throw new InternalAzuriteError('AzuriteRequest: req cannot be undefined!');
        }

        this.httpProps = {};
        this.metaProps = {};
        this.body = req.body;
        this.entityType = entityType;
        this.query = req.query;
        this.now = Date.now();
        this.payload = payload;
        this._initMetaProps(req.rawHeaders);
        this._initHttpProps(req.headers);
    }

    static clone(request) {
        const copy = new AzuriteRequest();
        Object.assign(copy, request);
        return copy;
    }

     /**
     * A container request cannot refer to a blob name (which is what publicName is about).
     * 
     * @returns 
     * @memberof AzuriteRequest
     */
    publicName() {
        return undefined;
    }

    /**
     * Only Blobs can be snapshotted.
     * 
     * @returns 
     * @memberof AzuriteRequest
     */
    isSnapshot() {
        return false;
    }

    leaseId() {
        return this.httpProps[N.LEASE_ID];
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

    _initHttpProps(httpHeaders) {
        this.httpProps[N.CONTENT_LENGTH] = httpHeaders['Content-Length'] || httpHeaders['content-length'];
        // x-ms-* attributes have precedence over according HTTP-Headers
        this.httpProps[N.CONTENT_TYPE] = httpHeaders['x-ms-blob-content-type'] || httpHeaders['content-type'] || 'application/octet-stream';
        this.httpProps[N.CONTENT_ENCODING] = httpHeaders['x-ms-blob-content-encoding'] || httpHeaders['content-encoding'];
        this.httpProps[N.CONTENT_DISPOSITION] = httpHeaders['x-ms-blob-content-disposition'] || httpHeaders['content-disposition'];
        this.httpProps[N.CACHE_CONTROL] = httpHeaders['x-ms-blob-cache-control'] || httpHeaders['cache-control'];
        this.httpProps[N.CONTENT_LANGUAGE] = httpHeaders['x-ms-blob-content-language'] || httpHeaders['content-language'];
        this.httpProps[N.CONTENT_MD5] = httpHeaders['x-ms-blob-content-md5'] || httpHeaders['content-md5'];
        this.httpProps[N.RANGE] = httpHeaders['x-ms-range'] || httpHeaders['range'];

        this.httpProps[N.BLOB_TYPE] = httpHeaders['x-ms-blob-type']
        this.httpProps[N.RANGE_GET_CONTENT_MD5] = httpHeaders['x-ms-range-get-content-md5'];
        this.httpProps[N.DELETE_SNAPSHOTS] = httpHeaders['x-ms-delete-snapshots'];
        this.httpProps[N.LEASE_ID] = httpHeaders['x-ms-lease-id'];
        this.httpProps[N.LEASE_ACTION] = httpHeaders['x-ms-lease-action'];
        this.httpProps[N.LEASE_DURATION] = httpHeaders['x-ms-lease-duration'];
        this.httpProps[N.LEASE_BREAK_PERIOD] = httpHeaders['x-ms-lease-break-period'];
        this.httpProps[N.PROPOSED_LEASE_ID] = httpHeaders['x-ms-proposed-lease-id'];
        this.httpProps[N.IF_MODFIFIED_SINCE] = httpHeaders['if-modified-since'];
        this.httpProps[N.IF_UNMODIFIED_SINCE] = httpHeaders['if-unmodified-since'];
        this.httpProps[N.IF_MATCH] = httpHeaders['if-match'];
        this.httpProps[N.IF_NONE_MATCH] = httpHeaders['if-none-match'];
        this.httpProps[N.SOURCE_IF_MODFIFIED_SINCE] = httpHeaders['x-ms-source-if-modified-since'];
        this.httpProps[N.SOURCE_IF_UNMODIFIED_SINCE] = httpHeaders['x-ms-source-if-unmodified-since'];
        this.httpProps[N.SOURCE_IF_MATCH] = httpHeaders['x-ms-source-if-match'];
        this.httpProps[N.SOURCE_IF_NONE_MATCH] = httpHeaders['x-ms-source-if-none-match'];
        this.httpProps[N.COPY_SOURCE] = httpHeaders['x-ms-copy-source'];

        // As per spec @ https://docs.microsoft.com/en-us/rest/api/storageservices/set-container-acl 
        // if this header is not specified it is set to 'private' per default.
        this.httpProps[N.BLOB_PUBLIC_ACCESS] = httpHeaders['x-ms-blob-public-access'] || 'private';
        // Append Blobs specific
        this.httpProps[N.BLOB_CONDITION_MAX_SIZE] = parseInt(httpHeaders['x-ms-blob-condition-maxsize']) || undefined;
        this.httpProps[N.BLOB_CONDITION_APPENDPOS] = parseInt(httpHeaders['x-ms-blob-condition-appendpos']) || undefined;
        // Page Blobs specific 
        this.httpProps[N.BLOB_CONTENT_LENGTH] = httpHeaders['x-ms-blob-content-length'];
        this.httpProps[N.PAGE_WRITE] = httpHeaders['x-ms-page-write'];
        this.httpProps[N.IF_SEQUENCE_NUMBER_LE] = httpHeaders['x-ms-if-sequence-number-le'];
        this.httpProps[N.IF_SEQUENCE_NUMBER_LT] = httpHeaders['x-ms-if-sequence-number-lt'];
        this.httpProps[N.IF_SEQUENCE_NUMBER_EQ] = httpHeaders['x-ms-if-sequence-number-eq'];

        Object.keys(this.httpProps).forEach((key) => {
            if (this.httpProps[key] === undefined || this.httpProps[key] === 'undefined') {
                delete this.httpProps[key];
            }
        });
    }
}

module.exports = AzuriteRequest;