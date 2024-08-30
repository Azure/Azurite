import { BlobModel, ContainerModel } from "../persistence/IBlobMetadataStore";
import IConditionResource from "./IConditionResource";
import { BlobTags } from "../generated/artifacts/models";

export default class ConditionResourceAdapter implements IConditionResource {
  public exist: boolean;
  public etag: string;
  public lastModified: Date;
  public tags?: BlobTags;

  public constructor(resource: BlobModel | ContainerModel | undefined | null) {
    if (
      resource === undefined ||
      resource === null ||
      (resource as BlobModel).isCommitted === false // Treat uncommitted blob as unexist resource
    ) {
      this.exist = false;
      this.etag = "UNEXIST_RESOURCE_ETAG";
      this.lastModified = undefined as any;
      return;
    }

    this.exist = true;
    this.etag = resource.properties.etag;
    this.tags = (resource as BlobModel)?.blobTags;

    if (this.etag.length < 3) {
      throw new Error(
        `ConditionResourceAdapter::constructor() Invalid etag ${this.etag}.`
      );
    }

    if (this.etag.startsWith('"') && this.etag.endsWith('"')) {
      this.etag = this.etag.substring(1, this.etag.length - 1);
    }

    this.lastModified = new Date(resource.properties.lastModified);
    this.lastModified.setMilliseconds(0); // Precision to seconds
  }
}
