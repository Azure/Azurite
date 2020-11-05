import { convertRawHeadersToMetadata, newEtag } from "../../common/utils/utils";
import BlobStorageContext from "../context/BlobStorageContext";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IContainerHandler from "../generated/handlers/IContainerHandler";
import {
  BLOB_API_VERSION,
  EMULATOR_ACCOUNT_KIND,
  EMULATOR_ACCOUNT_SKUNAME
} from "../utils/constants";
import { DEFAULT_LIST_BLOBS_MAX_RESULTS } from "../utils/constants";
import { removeQuotationFromListBlobEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";

/**
 * ContainerHandler handles Azure Storage Blob container related requests.
 *
 * @export
 * @class ContainerHandler
 * @implements {IHandler}
 */
export default class ContainerHandler extends BaseHandler
  implements IContainerHandler {
  /**
   * Create container.
   *
   * @param {Models.ContainerCreateOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerCreateResponse>}
   * @memberof ContainerHandler
   */
  public async create(
    options: Models.ContainerCreateOptionalParams,
    context: Context
  ): Promise<Models.ContainerCreateResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const lastModified = blobCtx.startTime!;
    const etag = newEtag();

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders()
    );

    await this.metadataStore.createContainer(context, {
      accountName,
      name: containerName,
      metadata,
      properties: {
        etag,
        lastModified,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        publicAccess: options.access,
        hasImmutabilityPolicy: false,
        hasLegalHold: false
      }
    });

    const response: Models.ContainerCreateResponse = {
      statusCode: 201,
      requestId: blobCtx.contextId,
      clientRequestId: options.requestId,
      eTag: etag,
      lastModified,
      version: BLOB_API_VERSION
    };

    return response;
  }

  /**
   * get container properties
   *
   * @param {Models.ContainerGetPropertiesOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetPropertiesResponse>}
   * @memberof ContainerHandler
   */
  public async getProperties(
    options: Models.ContainerGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ContainerGetPropertiesResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const containerProperties = await this.metadataStore.getContainerProperties(
      context,
      accountName,
      containerName,
      options.leaseAccessConditions
    );

    const response: Models.ContainerGetPropertiesResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      eTag: containerProperties.properties.etag,
      ...containerProperties.properties,
      blobPublicAccess: containerProperties.properties.publicAccess,
      metadata: containerProperties.metadata,
      version: BLOB_API_VERSION
    };

    return response;
  }

  /**
   * get container properties with headers
   *
   * @param {Models.ContainerGetPropertiesOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetPropertiesResponse>}
   * @memberof ContainerHandler
   */
  public async getPropertiesWithHead(
    options: Models.ContainerGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ContainerGetPropertiesResponse> {
    return this.getProperties(options, context);
  }

  /**
   * Delete container.
   *
   * @param {Models.ContainerDeleteMethodOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerDeleteResponse>}
   * @memberof ContainerHandler
   */
  public async delete(
    options: Models.ContainerDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.ContainerDeleteResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    // TODO: Mark container as being deleted status, then (mark) delete all blobs async
    // When above finishes, execute following delete container operation
    // Because following delete container operation will only delete DB metadata for container and
    // blobs under the container, but will not clean up blob data in disk
    // The current design will directly remove the container and all the blobs belong to it.
    await this.metadataStore.deleteContainer(
      context,
      accountName,
      containerName,
      options
    );

    const response: Models.ContainerDeleteResponse = {
      statusCode: 202,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date: context.startTime,
      version: BLOB_API_VERSION
    };

    return response;
  }

  /**
   * Set container metadata.
   *
   * @param {Models.ContainerSetMetadataOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerSetMetadataResponse>}
   * @memberof ContainerHandler
   */
  public async setMetadata(
    options: Models.ContainerSetMetadataOptionalParams,
    context: Context
  ): Promise<Models.ContainerSetMetadataResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const date = blobCtx.startTime!;
    const eTag = newEtag();

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders()
    );

    await this.metadataStore.setContainerMetadata(
      context,
      accountName,
      containerName,
      date,
      eTag,
      metadata,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.ContainerSetMetadataResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date,
      eTag,
      lastModified: date
    };

    return response;
  }

  /**
   * Get container access policy.
   *
   * @param {Models.ContainerGetAccessPolicyOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetAccessPolicyResponse>}
   * @memberof ContainerHandler
   */
  public async getAccessPolicy(
    options: Models.ContainerGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.ContainerGetAccessPolicyResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const containerAcl = await this.metadataStore.getContainerACL(
      context,
      accountName,
      containerName,
      options.leaseAccessConditions
    );

    const response: any = [];
    const responseArray = response as Models.SignedIdentifier[];
    const responseObject = response as Models.ContainerGetAccessPolicyHeaders & {
      statusCode: 200;
    };
    if (containerAcl.containerAcl !== undefined) {
      responseArray.push(...containerAcl.containerAcl);
    }
    responseObject.date = containerAcl.properties.lastModified;
    responseObject.blobPublicAccess = containerAcl.properties.publicAccess;
    responseObject.eTag = containerAcl.properties.etag;
    responseObject.lastModified = containerAcl.properties.lastModified;
    responseObject.requestId = context.contextId;
    responseObject.version = BLOB_API_VERSION;
    responseObject.statusCode = 200;
    responseObject.clientRequestId = options.requestId;

    // TODO: Need fix generator code since the output containerAcl can't be serialized correctly
    // tslint:disable-next-line:max-line-length
    // Correct responds： <?xml version="1.0" encoding="utf-8"?><SignedIdentifiers><SignedIdentifier><Id>123</Id><AccessPolicy><Start>2019-04-30T16:00:00.0000000Z</Start><Expiry>2019-12-31T16:00:00.0000000Z</Expiry><Permission>r</Permission></AccessPolicy></SignedIdentifier></SignedIdentifiers>
    // tslint:disable-next-line:max-line-length
    // Current responds: <?xml version="1.0" encoding="UTF-8" standalone="yes"?><parsedResponse><Id>123</Id><AccessPolicy><Start>2019-04-30T16:00:00Z</Start><Expiry>2019-12-31T16:00:00Z</Expiry><Permission>r</Permission></AccessPolicy></parsedResponse>"
    return response;
  }

  /**
   * set container access policy
   *
   * @param {Models.ContainerSetAccessPolicyOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerSetAccessPolicyResponse>}
   * @memberof ContainerHandler
   */
  public async setAccessPolicy(
    options: Models.ContainerSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.ContainerSetAccessPolicyResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const date = blobCtx.startTime!;
    const eTag = newEtag();
    await this.metadataStore.setContainerACL(
      context,
      accountName,
      containerName,
      {
        lastModified: date,
        etag: eTag,
        publicAccess: options.access,
        containerAcl: options.containerAcl,
        leaseAccessConditions: options.leaseAccessConditions,
        modifiedAccessConditions: options.modifiedAccessConditions
      }
    );

    const response: Models.ContainerSetAccessPolicyResponse = {
      date,
      eTag,
      lastModified: date,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      statusCode: 200,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Acquire container lease.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   *
   * @param {Models.ContainerAcquireLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerAcquireLeaseResponse>}
   * @memberof ContainerHandler
   */
  public async acquireLease(
    options: Models.ContainerAcquireLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerAcquireLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const res = await this.metadataStore.acquireContainerLease(
      context,
      accountName,
      containerName,
      options
    );

    const response: Models.ContainerAcquireLeaseResponse = {
      statusCode: 201,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date: blobCtx.startTime!,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      leaseId: res.leaseId,
      version: BLOB_API_VERSION
    };

    return response;
  }

  /**
   * Release container lease.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   *
   * @param {string} leaseId
   * @param {Models.ContainerReleaseLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerReleaseLeaseResponse>}
   * @memberof ContainerHandler
   */
  public async releaseLease(
    leaseId: string,
    options: Models.ContainerReleaseLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerReleaseLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const res = await this.metadataStore.releaseContainerLease(
      context,
      accountName,
      containerName,
      leaseId,
      options
    );

    const response: Models.ContainerReleaseLeaseResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date: blobCtx.startTime!,
      eTag: res.etag,
      lastModified: res.lastModified,
      version: BLOB_API_VERSION
    };

    return response;
  }

  /**
   * Renew container lease.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   *
   * @param {string} leaseId
   * @param {Models.ContainerRenewLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerRenewLeaseResponse>}
   * @memberof ContainerHandler
   */
  public async renewLease(
    leaseId: string,
    options: Models.ContainerRenewLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerRenewLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const res = await this.metadataStore.renewContainerLease(
      context,
      accountName,
      containerName,
      leaseId,
      options
    );

    const response: Models.ContainerRenewLeaseResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date: blobCtx.startTime!,
      leaseId: res.leaseId,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      version: BLOB_API_VERSION
    };

    return response;
  }

  /**
   * Break container lease.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   *
   * @param {Models.ContainerBreakLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerBreakLeaseResponse>}
   * @memberof ContainerHandler
   */
  public async breakLease(
    options: Models.ContainerBreakLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerBreakLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const res = await this.metadataStore.breakContainerLease(
      context,
      accountName,
      containerName,
      options.breakPeriod,
      options
    );

    const response: Models.ContainerBreakLeaseResponse = {
      statusCode: 202,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date: blobCtx.startTime!,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      leaseTime: res.leaseTime,
      version: BLOB_API_VERSION
    };

    return response;
  }

  /**
   * Change container lease.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   *
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Models.ContainerChangeLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerChangeLeaseResponse>}
   * @memberof ContainerHandler
   */
  public async changeLease(
    leaseId: string,
    proposedLeaseId: string,
    options: Models.ContainerChangeLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerChangeLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const res = await this.metadataStore.changeContainerLease(
      context,
      accountName,
      containerName,
      leaseId,
      proposedLeaseId,
      options
    );

    const response: Models.ContainerChangeLeaseResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date: blobCtx.startTime!,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      leaseId: res.leaseId,
      version: BLOB_API_VERSION
    };

    return response;
  }

  /**
   * list blobs flat segments
   *
   * @param {Models.ContainerListBlobFlatSegmentOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerListBlobFlatSegmentResponse>}
   * @memberof ContainerHandler
   */
  public async listBlobFlatSegment(
    options: Models.ContainerListBlobFlatSegmentOptionalParams,
    context: Context
  ): Promise<Models.ContainerListBlobFlatSegmentResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const request = context.request!;
    const marker = options.marker;
    const delimiter = "";
    options.marker = options.marker || "";
    let includeSnapshots: boolean = false;
    let includeUncommittedBlobs: boolean = false;
    if (options.include !== undefined) {
      if (options.include.includes(Models.ListBlobsIncludeItem.Snapshots)) {
        includeSnapshots = true;
      }
      if (
        options.include.includes(Models.ListBlobsIncludeItem.Uncommittedblobs)
      ) {
        includeUncommittedBlobs = true;
      }
    }
    if (
      options.maxresults === undefined ||
      options.maxresults > DEFAULT_LIST_BLOBS_MAX_RESULTS
    ) {
      options.maxresults = DEFAULT_LIST_BLOBS_MAX_RESULTS;
    }

    const [blobs, nextMarker] = await this.metadataStore.listBlobs(
      context,
      accountName,
      containerName,
      undefined,
      options.prefix,
      options.maxresults,
      marker,
      includeSnapshots,
      includeUncommittedBlobs
    );

    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const response: Models.ContainerListBlobFlatSegmentResponse = {
      statusCode: 200,
      contentType: "application/xml",
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      serviceEndpoint,
      containerName,
      prefix: options.prefix || "",
      marker: options.marker,
      maxResults: options.maxresults,
      delimiter,
      segment: {
        blobItems: blobs.map(item => {
          return {
            ...item,
            deleted: item.deleted !== true ? undefined : true,
            properties: {
              ...item.properties,
              etag: removeQuotationFromListBlobEtag(item.properties.etag),
              accessTierInferred:
                item.properties.accessTierInferred === true ? true : undefined
            }
          };
        })
      },
      clientRequestId: options.requestId,
      nextMarker: `${nextMarker || ""}`
    };

    return response;
  }

  /**
   * List blobs hierarchy.
   *
   * @param {string} delimiter
   * @param {Models.ContainerListBlobHierarchySegmentOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerListBlobHierarchySegmentResponse>}
   * @memberof ContainerHandler
   */
  public async listBlobHierarchySegment(
    delimiter: string,
    options: Models.ContainerListBlobHierarchySegmentOptionalParams,
    context: Context
  ): Promise<Models.ContainerListBlobHierarchySegmentResponse> {
    // TODO: Need update list out blobs lease properties with BlobHandler.updateLeaseAttributes()
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const request = context.request!;
    const marker = options.marker;
    delimiter = delimiter === "" ? "/" : delimiter;
    options.prefix = options.prefix || "";
    options.marker = options.marker || "";
    let includeSnapshots: boolean = false;
    let includeUncommittedBlobs: boolean = false;
    if (options.include !== undefined) {
      if (options.include.includes(Models.ListBlobsIncludeItem.Snapshots)) {
        includeSnapshots = true;
      }
      if (
        options.include.includes(Models.ListBlobsIncludeItem.Uncommittedblobs)
      ) {
        includeUncommittedBlobs = true;
      }
    }
    if (
      options.maxresults === undefined ||
      options.maxresults > DEFAULT_LIST_BLOBS_MAX_RESULTS
    ) {
      options.maxresults = DEFAULT_LIST_BLOBS_MAX_RESULTS;
    }

    const [blobs, nextMarker] = await this.metadataStore.listBlobs(
      context,
      accountName,
      containerName,
      undefined,
      options.prefix,
      options.maxresults,
      marker,
      includeSnapshots,
      includeUncommittedBlobs
    );

    const blobItems: Models.BlobItem[] = [];
    const blobPrefixes: Models.BlobPrefix[] = [];
    const blobPrefixesSet = new Set<string>();

    const prefixLength = options.prefix.length;
    for (const blob of blobs) {
      const delimiterPosAfterPrefix = blob.name.indexOf(
        delimiter,
        prefixLength
      );

      // This is a blob
      if (delimiterPosAfterPrefix < 0) {
        blob.deleted = blob.deleted !== true ? undefined : true;
        blobItems.push(blob);
      } else {
        // This is a prefix
        const prefix = blob.name.substr(0, delimiterPosAfterPrefix + 1);
        blobPrefixesSet.add(prefix);
      }
    }

    const iter = blobPrefixesSet.values();
    let val;
    while (!(val = iter.next()).done) {
      blobPrefixes.push({ name: val.value });
    }

    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const response: Models.ContainerListBlobHierarchySegmentResponse = {
      statusCode: 200,
      contentType: "application/xml",
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      serviceEndpoint,
      containerName,
      prefix: options.prefix,
      marker: options.marker,
      maxResults: options.maxresults,
      delimiter,
      segment: {
        blobPrefixes,
        blobItems: blobItems.map(item => {
          return {
            ...item,
            properties: {
              ...item.properties,
              etag: removeQuotationFromListBlobEtag(item.properties.etag),
              accessTierInferred:
                item.properties.accessTierInferred === true ? true : undefined
            }
          };
        })
      },
      clientRequestId: options.requestId,
      nextMarker: `${nextMarker || ""}`
    };

    return response;
  }

  /**
   * get account info
   *
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetAccountInfoResponse>}
   * @memberof ContainerHandler
   */
  public async getAccountInfo(
    context: Context
  ): Promise<Models.ContainerGetAccountInfoResponse> {
    const response: Models.ContainerGetAccountInfoResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: context.request!.getHeader("x-ms-client-request-id"),
      skuName: EMULATOR_ACCOUNT_SKUNAME,
      accountKind: EMULATOR_ACCOUNT_KIND,
      date: context.startTime!,
      version: BLOB_API_VERSION
    };
    return response;
  }

  /**
   * get account info with headers
   *
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetAccountInfoResponse>}
   * @memberof ContainerHandler
   */
  public async getAccountInfoWithHead(
    context: Context
  ): Promise<Models.ContainerGetAccountInfoResponse> {
    return this.getAccountInfo(context);
  }
}
