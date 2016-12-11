'use strict';

/*
 * These classes are used as model for XML-Serialization in the "ListBlobs" API.
 */
class BlobList {
    constructor() {
        this.prefix = '';
        this.marker = '';
        this.maxResults = '';
        this.blobs = {
            blob: []
        }
        this.nextMarker;
        this.blobprefix = {
            name: ''
        }
    }
}

class Blob {
    constructor(name) {
        this.name = name;
        this.snapshot = '';
        this.properties = new Properties();
        this.metadata = {};
    }
}

class Properties {
    constructor() {
        this['Last-Modified'];
        this.ETag;
        this['Content-Length'];
        this['Content-Type'];
        this['Content-Encoding'];
        this['Content-Language'];
        this['Content-MD5'];
        this['Cache-Control'];
        this.BlobType = 'BlockBlob';
        this.LeaseStatus = 'unlocked';
        this.LeaseState = 'available';
        this.LeaseDuration = 'infinite';
        this.ServerEncrypted = false;
    }
}

module.exports = {
    BlobList: BlobList,
    Blob: Blob
}