import { convertRawHeadersToMetadata } from "../../common/utils/utils";
import { getMD5FromStream, newEtag } from "../../common/utils/utils";
import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IAppendBlobHandler from "../generated/handlers/IAppendBlobHandler";
import { BlobModel } from "../persistence/IBlobMetadataStore";
import {
  BLOB_API_VERSION,
  HeaderConstants,
  MAX_APPEND_BLOB_BLOCK_COUNT,
  MAX_APPEND_BLOB_BLOCK_SIZE
} from "../utils/constants";
import { getTagsFromString } from "../utils/utils";
import BaseHandler from "./BaseHandler";

export default class AppendBlobHandler extends BaseHandler
  implements IAppendBlobHandler {
  public async create(
    contentLength: number,
    options: Models.AppendBlobCreateOptionalParams,
    context: Context
  ): Promise<Models.AppendBlobCreateResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;
    const etag = newEtag();

    if (contentLength !== 0 && !this.loose) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId!,
        "Content-Length must be 0 for Create Append Blob request."
      );
    }

    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      options.blobHTTPHeaders.blobContentType ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders(), context.contextId!
    );

    const blob: BlobModel = {
      deleted: false,
      metadata,
      accountName,
      containerName,
      name: blobName,
      properties: {
        creationTime: date,
        lastModified: date,
        etag,
        contentLength: 0,
        contentType,
        contentEncoding: options.blobHTTPHeaders.blobContentEncoding,
        contentLanguage: options.blobHTTPHeaders.blobContentLanguage,
        contentMD5: options.blobHTTPHeaders.blobContentMD5,
        contentDisposition: options.blobHTTPHeaders.blobContentDisposition,
        cacheControl: options.blobHTTPHeaders.blobCacheControl,
        blobType: Models.BlobType.AppendBlob,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        serverEncrypted: true,
        isSealed: false,
      },
      snapshot: "",
      isCommitted: true,
      committedBlocksInOrder: [],
      blobTags: options.blobTagsString === undefined ? undefined : getTagsFromString(options.blobTagsString, context.contextId!),
    };

    await this.metadataStore.createBlob(
      context,
      blob,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.AppendBlobCreateResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: blob.properties.lastModified,
      contentMD5: blob.properties.contentMD5,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }

  public async appendBlock(
    body: NodeJS.ReadableStream,
    contentLength: number,
    options: Models.AppendBlobAppendBlockOptionalParams,
    context: Context
  ): Promise<Models.AppendBlobAppendBlockResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    if (contentLength > MAX_APPEND_BLOB_BLOCK_SIZE) {
      throw StorageErrorFactory.getRequestEntityTooLarge(blobCtx.contextId);
    }

    if (contentLength === 0) {
      throw StorageErrorFactory.getInvalidHeaderValue(blobCtx.contextId, {
        HeaderName: HeaderConstants.CONTENT_LENGTH,
        HeaderValue: "0"
      });
    }

    // TODO: Optimize with cache
    const blob = await this.metadataStore.downloadBlob(
      blobCtx,
      accountName,
      containerName,
      blobName,
      undefined
    );

    if (blob.properties.blobType !== Models.BlobType.AppendBlob) {
      throw StorageErrorFactory.getBlobInvalidBlobType(blobCtx.contextId);
    }

    const committedBlockCount = (blob.committedBlocksInOrder || []).length;
    if (committedBlockCount >= MAX_APPEND_BLOB_BLOCK_COUNT) {
      throw StorageErrorFactory.getBlockCountExceedsLimit(blobCtx.contextId);
    }

    // Persist content
    const extent = await this.extentStore.appendExtent(body, blobCtx.contextId);
    if (extent.count !== contentLength) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId,
        `The size of the request body ${extent.count} mismatches the content-length ${contentLength}.`
      );
    }

    // MD5
    const contentMD5 = blobCtx.request!.getHeader(HeaderConstants.CONTENT_MD5);
    let contentMD5Buffer;
    let contentMD5String;

    if (contentMD5 !== undefined) {
      contentMD5Buffer =
        typeof contentMD5 === "string"
          ? Buffer.from(contentMD5, "base64")
          : contentMD5;
      contentMD5String =
        typeof contentMD5 === "string"
          ? contentMD5
          : contentMD5Buffer.toString("base64");

      const stream = await this.extentStore.readExtent(
        extent,
        blobCtx.contextId
      );
      const calculatedContentMD5Buffer = await getMD5FromStream(stream);
      const calculatedContentMD5String = Buffer.from(
        calculatedContentMD5Buffer
      ).toString("base64");

      if (contentMD5String !== calculatedContentMD5String) {
        throw StorageErrorFactory.getMd5Mismatch(
          context.contextId,
          contentMD5String,
          calculatedContentMD5String
        );
      }
    }

    const originOffset = blob.properties.contentLength;

    const properties = await this.metadataStore.appendBlock(
      blobCtx,
      {
        accountName,
        containerName,
        blobName,
        isCommitted: true,
        name: "", // No block ID for append block
        size: extent.count,
        persistency: extent
      },
      options.leaseAccessConditions,
      options.modifiedAccessConditions,
      options.appendPositionAccessConditions
    );

    const response: Models.AppendBlobAppendBlockResponse = {
      statusCode: 201,
      requestId: context.contextId,
      eTag: properties.etag,
      lastModified: properties.lastModified,
      contentMD5: contentMD5Buffer,
      xMsContentCrc64: undefined,
      clientRequestId: options.requestId,
      version: BLOB_API_VERSION,
      date,
      blobAppendOffset: `${originOffset}`,
      blobCommittedBlockCount: committedBlockCount + 1,
      isServerEncrypted: true
    };

    return response;
  }

  public appendBlockFromUrl(
    sourceUrl: string,
    contentLength: number,
    options: Models.AppendBlobAppendBlockFromUrlOptionalParams,
    context: Context
  ): Promise<Models.AppendBlobAppendBlockFromUrlResponse> {
    throw new NotImplementedError(context.contextId);
  }

  public async seal(
    options: Models.AppendBlobSealOptionalParams,
    context: Context
  ): Promise<Models.AppendBlobSealResponse> {

    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    const properties = await this.metadataStore.sealBlob(
      blobCtx,
      accountName,
      containerName,
      blobName,
      undefined,
      options
    );

    const response: Models.AppendBlobSealResponse = {
      statusCode: 200,
      requestId: context.contextId,
      eTag: properties.etag,
      lastModified: properties.lastModified,
      clientRequestId: options.requestId,
      version: BLOB_API_VERSION,
      date,
      isSealed: properties.isSealed,
    };

    return response;
  }
}
