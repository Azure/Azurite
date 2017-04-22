'use strict';

/*
 * These classes are used as model for XML-Serialization in the "ListBlobs" API.
 */
class BlobList {
    constructor() {
        this.Prefix = '';
        this.Marker = '';
        this.MaxResults = '';
        this.Blobs = {
            Blob: []
        };
        this.NextMarker;
        this.BlobPrefix = {
            name: ''
        };
    }
}

class Blob {
    constructor(name, blobType) {
        this.Name = name;
        // Snapshot feature has not been implemented yet
        // this.Snapshot = '';
        this.Properties = new Properties(blobType);
        this.Metadata = {};
    }
}

class Properties {
    constructor(blobType) {
        this['Last-Modified'];
        this.ETag;
        this['Content-Length'];
        this['Content-Type'];
        this['Content-Encoding'];
        this['Content-Language'];
        this['Content-MD5'];
        this['Cache-Control'];
        this.BlobType = blobType;
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