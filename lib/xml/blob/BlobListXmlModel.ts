'use strict';

/*
 * These classes are used as model for XML-Serialization in the "ListBlobs" API.
 */
class BlobList {
    Prefix: any;
    MaxResults: any;
    Delimiter: any;
    NextMarker: any;
    Marker: any;
    Blobs: any;
    constructor() {
        this.Prefix = '';
        this.Marker = '';
        this.MaxResults = '';
        this.Delimiter = '';
        this.Blobs = {
            Blob: [],
            BlobPrefix: ''
        };
        this.NextMarker = {};
    }
}

class Blob {
    Metadata: any;
    Snapshot: any;
    Properties: any;
    Name: any;
    constructor(name, blobType) {
        this.Name = name;
        this.Snapshot;
        this.Properties = new Properties(blobType);
        this.Metadata = {};
    }
}

class Properties {
    ETag: any;
    BlobType: any;
    LeaseStatus: string;
    LeaseState: string;
    LeaseDuration: string;
    ServerEncrypted: boolean;
    CopyId: any;
    CopyStatus: any;
    CopySource: any;
    CopyProgress: any;
    CopyCompletionTime: any;
    CopyStatusDescription: any;
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
        this.CopyId;
        this.CopyStatus;
        this.CopySource;
        this.CopyProgress;
        this.CopyCompletionTime;
        this.CopyStatusDescription;
    }
}

function blobPrefixesToXml(blobPrefixes) {
    let xml = '';
    for (const prefix of blobPrefixes) {
        xml += `<BlobPrefix><Name>${prefix}</Name></BlobPrefix>`;
    }
    return xml;
}

export default {
    BlobList: BlobList,
    Blob: Blob,
    blobPrefixesToXml: blobPrefixesToXml
};