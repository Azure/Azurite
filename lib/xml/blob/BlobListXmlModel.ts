/*
 * These classes are used as model for XML-Serialization in the "ListBlobs" API.
 */
export class BlobList {
  public Prefix: any;
  public MaxResults: any;
  public Delimiter: any;
  public NextMarker: any;
  public Marker: any;
  public Blobs: any;
  constructor() {
    this.Prefix = "";
    this.Marker = "";
    this.MaxResults = "";
    this.Delimiter = "";
    this.Blobs = {
      Blob: [],
      BlobPrefix: ""
    };
    this.NextMarker = {};
  }
}

export class Blob {
  public Metadata: any;
  public Snapshot: any;
  public Properties: any;
  constructor(private name, blobType) {
    this.Properties = new Properties(blobType);
    this.Metadata = {};
  }
}

class Properties {
  constructor(blobType) {
    this["Last-Modified"];
    this.ETag;
    this["Content-Length"];
    this["Content-Type"];
    this["Content-Encoding"];
    this["Content-Language"];
    this["Content-MD5"];
    this["Cache-Control"];
    this.BlobType = blobType;
    this.LeaseStatus = "unlocked";
    this.LeaseState = "available";
    this.LeaseDuration = "infinite";
    this.ServerEncrypted = false;
    this.CopyId;
    this.CopyStatus;
    this.CopySource;
    this.CopyProgress;
    this.CopyCompletionTime;
    this.CopyStatusDescription;
  }
}

export function blobPrefixesToXml(blobPrefixes) {
  let xml = "";
  for (const prefix of blobPrefixes) {
    xml += `<BlobPrefix><Name>${prefix}</Name></BlobPrefix>`;
  }
  return xml;
}
