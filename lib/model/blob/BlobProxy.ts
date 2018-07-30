import InternalAzuriteError from "../../core/InternalAzuriteError";
import computeEtag from "../../core/utils";
import StorageEntityProxy from "./StorageEntityProxy";

/**
 * Serves as a blob proxy to the corresponding LokiJS object.
 *
 * @class BlobProxy
 */
class BlobProxy extends StorageEntityProxy {
  public static createFromArray(entities, containerName) {
    const array = [];
    for (const entity of entities) {
      array.push(new BlobProxy(entity, containerName));
    }
    return array;
  }
  public containerName: any;
  constructor(original, containerName) {
    super(original);
    if (!containerName) {
      throw new InternalAzuriteError("BlobProxy: missing containerName");
    }
    this.containerName = containerName;
  }

  /**
   * Updates and returns the strong ETag of the underlying blob.
   *
   * @returns
   * @memberof BlobProxy
   */
  public updateETag() {
    const etagValue = computeEtag(
      `${this.lastModified()}${JSON.stringify(this.original.metaProps)}${
        this.original.id
      }${this.original.meta.revision}`
    );
    this.original.etag = `${etagValue}`;
    return this.original.etag;
  }
}

export default BlobProxy;
