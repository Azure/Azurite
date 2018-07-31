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
  public ETag: any;
  public BlobType: any;
  public LeaseStatus: string;
  public LeaseState: string;
  public LeaseDuration: string;
  public ServerEncrypted: boolean;
  public CopyId: any;
  public CopyStatus: any;
  public CopySource: any;
  public CopyProgress: any;
  public CopyCompletionTime: any;
  public CopyStatusDescription: any;
  constructor(blobType) {
    // this["Last-Modified"];

    // this["Content-Length"];
    // this["Content-Type"];
    // this["Content-Encoding"];
    // this["Content-Language"];
    // this["Content-MD5"];
    // this["Cache-Control"];
    this.BlobType = blobType;
    this.LeaseStatus = "unlocked";
    this.LeaseState = "available";
    this.LeaseDuration = "infinite";
    this.ServerEncrypted = false;
  }
}

export function blobPrefixesToXml(blobPrefixes) {
  let xml = "";
  for (const prefix of blobPrefixes) {
    xml += `<BlobPrefix><Name>${prefix}</Name></BlobPrefix>`;
  }
  return xml;
}
