'use strict';

const StorageItem = require('./StorageItem'),
    BlobTypes = require('./../Constants').BlobTypes;

class Blob extends StorageItem {
    constructor(name, httpHeader, blobType) {
        super(name, httpHeader);
        if (blobType) {
            this.blobType = blobType;
            this.httpProps['x-ms-blob-type'] = blobType;
        }
        this.snapshot = false;
        this._addProps(httpHeader);
    }

    _addProps(httpHeader) {
        if (this.blobType === BlobTypes.AppendBlob) {
            this.httpProps['x-ms-blob-committed-block-count'] = 0;
        }
        if (this.blobType === BlobTypes.PageBlob) {
            this.httpProps['x-ms-blob-content-length'] = httpHeader['x-ms-blob-content-length'];
            this.httpProps['x-ms-page-write'] = httpHeader['x-ms-page-write'] ? httpHeader['x-ms-page-write'].toUpperCase() : undefined;
            this.httpProps['x-ms-if-sequence-number-le'] = httpHeader['x-ms-if-sequence-number-le'];
            this.httpProps['x-ms-if-sequence-number-lt'] = httpHeader['x-ms-if-sequence-number-lt'];
            this.httpProps['x-ms-if-sequence-number-eq'] = httpHeader['x-ms-if-sequence-number-eq'];
            this.httpProps['If-Modified-Since'] = httpHeader['If-Modified-Since'] || httpHeader['if-modified-since'];
            this.httpProps['If-Unmodified-Since'] = httpHeader['If-Unmodified-Since'] || httpHeader['if-unmodified-since'];
            this.httpProps['If-Match'] = httpHeader['If-Match'] || httpHeader['if-match'];
            this.httpProps['If-None-Match'] = httpHeader['If-None-Match'] || httpHeader['if-none-match'];
            Object.keys(this.httpProps).forEach((key) => {
                if (this.httpProps[key] === undefined) {
                    delete this.httpProps[key];
                }
            });
        }
    }

    markAsSnapshot(dateTime) {
        this.snapshot = true;
    }

    /**
     * Checks whether blob name corresponds to a virtual directory. This is true if the name ends with at least trailing slash.
     * 
     * @returns true if name is followed by at least one '/' character, false otherwise.  
     * 
     * @memberof Blob
     */
    isVirtualDirectory() {
        return this.name.match('.*\/+$') !== null;
    }

    isSnapshot() {
        return this.snapshot;
    }

    /**
     * The name of the blob that is used in the web and disk interface. 
     * 
     * @memberof Blob
     */
    publicName() {
        if (this.isSnapshot()) {
            return `${this.name}-${Date.parse(this.httpProps['Last-Modified'])}`;
        }
        if (this.isVirtualDirectory()) {
            return Buffer.from(this.name, 'utf8').toString('base64');
        }
        return this.name;
    }
}

module.exports = Blob;