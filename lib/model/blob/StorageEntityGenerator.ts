import { StorageEntityType } from "../../core/Constants";
import N from "./../../core/HttpHeaderNames";
import computeEtag from "./../../core/utils";

/**
 * Generates an according Storage Entity (@type Container or @type Blob) out of a @ref AzuriteRequest object.
 *
 * @class StorageEntityGenerator
 */

class StorageEntityGenerator {
  /**
   * Generates a persistable storage entity respresentation based on a @type AzuriteRequest object
   *
   * @returns
   * @memberof StorageEntityGenerator
   */
  public generateStorageEntity(request) {
    const entity = this.createEntity(request);

    if (request.entityType === StorageEntityType.Container) {
      const container = {
        access: request.httpProps[N.BLOB_PUBLIC_ACCESS],
        etag: computeEtag(
          `${new Date()}${JSON.stringify(entity.metaProps)}${
            request.containerName
          }`
        ),
        name: request.containerName
      };
      return { ...entity, container };
    }
    // Common to all blobs
    const blob = {
      cacheControl: request.httpProps[N.CACHE_CONTROL],
      contentDisposition: request.httpProps[N.CONTENT_DISPOSITION],
      contentEncoding: request.httpProps[N.CONTENT_ENCODING],
      contentLanguage: request.httpProps[N.CONTENT_LANGUAGE],
      contentType: request.httpProps[N.CONTENT_TYPE],
      id: request.id,
      md5: request.httpProps[N.CONTENT_MD5] || request.calculateContentMd5(),
      name: request.blobName,
      originId: request.originId,
      // Parent ID refers to the blob a block belongs to
      parentId: request.parentId,
      // Origin ID refers to the blob a snapshot belongs to
      size: request.body ? request.body.length : 0,
      snapshot: false,
      uri: request.uri
    };

    // Specific to Append Blobs
    if (request.entityType === StorageEntityType.AppendBlob) {
      entity[N.BLOB_COMMITTED_BLOCK_COUNT] = 0;
      // According to https://docs.microsoft.com/en-us/rest/api/storageservices/append-block the MD5 hash which is
      // optionally set in Content-MD5 header is not stored with the blob, thus we delete it.
      delete blob.md5;
    }
    // Specific to Block Blobs that are potentially part of a commit
    else if (
      request.entityType === StorageEntityType.BlockBlob &&
      request.blockId !== undefined
    ) {
      blob[`blockId`] = request.blockId;
      // entity.parent = `${request.containerName}-${request.blobName}`;
      // entity.name = `${entity.parent}-${entity.blockId}`;
      blob[`committed`] = false;
    }
    // Specific to Page Blobs
    else if (request.entityType === StorageEntityType.PageBlob) {
      blob.size = request.httpProps[N.BLOB_CONTENT_LENGTH];
      blob[`sequenceNumber`] = 0;
      // MD5 calculation of a page blob seems to be wrong, thus deleting it for now...
      delete blob.md5;
    }
    return { ...entity, blob };
  }

  public clone(o) {
    return { ...o };
  }

  private createEntity(request: any) {
    return {
      access: "private",
      blob: undefined,
      container: undefined,
      entityType: request.entityType,
      leaseState: "available",
      metaProps: request.metaProps
    };
  }
}

export default new StorageEntityGenerator();
