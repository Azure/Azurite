'use strict';

const StorageItem = require('./StorageItem'),
    BlobTypes = require('./../Constants').BlobTypes;

class Blob extends StorageItem {
    constructor(name, httpHeader, blobType, rawHeaders) {
        super(name, httpHeader, rawHeaders);
        if (blobType) {
            this.blobType = blobType;
            this.httpProps['x-ms-blob-type'] = blobType;
        }
        this._addProps(httpHeader);
        this.snapshot = false;
    }

    static clone(blob) {
        const cloned = new Blob(blob.name, blob.httpProps, blob.blobType);
        cloned.metaProps = blob.metaProps;
        cloned.size = blob.size;
        return cloned;
    }

    _addProps(httpHeader) {
        if (this.blobType === BlobTypes.AppendBlob) {
            this.httpProps['x-ms-blob-committed-block-count'] = 0;
            this.httpProps['x-ms-blob-condition-maxsize'] = httpHeader['x-ms-blob-condition-maxsize']; 
            this.httpProps['x-ms-blob-condition-appendpos'] = httpHeader['x-ms-blob-condition-appendpos']; 
        }
        if (this.blobType === BlobTypes.PageBlob) {
            this.httpProps['x-ms-blob-content-length'] = httpHeader['x-ms-blob-content-length'];
            this.httpProps['x-ms-page-write'] = httpHeader['x-ms-page-write'] ? httpHeader['x-ms-page-write'].toUpperCase() : undefined;
            this.httpProps['x-ms-if-sequence-number-le'] = httpHeader['x-ms-if-sequence-number-le'];
            this.httpProps['x-ms-if-sequence-number-lt'] = httpHeader['x-ms-if-sequence-number-lt'];
            this.httpProps['x-ms-if-sequence-number-eq'] = httpHeader['x-ms-if-sequence-number-eq'];
            Object.keys(this.httpProps).forEach((key) => {
                if (this.httpProps[key] === undefined) {
                    delete this.httpProps[key];
                }
            });
        }
    }

    setSnapshotDate(date) {
        this.snapshotDate = date;
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
     * @returns 
     * 
     * @memberof Blob
     */
    publicName() {
        if (this.isSnapshot()) {
            return `${this.name}-${Date.parse(this.snapshotDate)}`;
        }
        if (this.isVirtualDirectory()) {
            return Buffer.from(this.name, 'utf8').toString('base64');
        }
        return this.name;
    }
}

module.exports = Blob;