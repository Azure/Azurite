/*
 * These classes are used as model for XML-Serialization in the "ListContainer" API.
*/
export class ContainerList {
  public Prefix: any;
  public MaxResults: any;
  public Marker: any;
  public NextMarker: any;
  public Containers: any;
  constructor() {
    this.Prefix = "";
    this.Marker = "";
    this.MaxResults = "";
    this.Containers = {
      Container: []
    };
  }
}

export class Container {
  public Metadata: any;
  public Properties: any;
  public Name: any;
  constructor(name) {
    this.Name = name || "";
    this.Properties = new Properties();
    this.Metadata = {};
  }
}

class Properties {
  public ETag: any;
  public LeaseStatus: string;
  public LeaseState: string;
  public LeaseDuration: string;
  public LastModified: any;
  constructor() {
    this.LeaseStatus = "unlocked";
    this.LeaseState = "available";
    this.LeaseDuration = "infinite";
  }
}
