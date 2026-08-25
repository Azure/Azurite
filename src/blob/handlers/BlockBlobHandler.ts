import axios, { AxiosResponse } from "axios";
import { IncomingMessage } from "http";
import { Agent } from "https";
import { TLSSocket } from "tls";

import { Readable } from "stream";

import { IExtentChunk } from "../../common/persistence/IExtentStore";
import {
  convertRawHeadersToMetadata,
  getMD5FromString,
  newEtag
} from "../../common/utils/utils";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlockBlobHandler from "../generated/handlers/IBlockBlobHandler";
import { parseXML } from "../generated/utils/xml";
import { BlobModel, BlockModel } from "../persistence/IBlobMetadataStore";
import { BLOB_API_VERSION } from "../utils/constants";
import BaseHandler from "./BaseHandler";
import {
  computeAndValidateTransactionalChecksums,
  getTagsFromString
} from "../utils/utils";

/**
 * Agents for the loopback self-request stageBlockFromURL makes to read a copy
 * source, keyed by the certificate they pin. Shared so requests reuse one
 * Agent rather than allocating their own, not for socket reuse: keep-alive
 * stays off, taking a loopback handshake per request over an idle socket that
 * the server may close mid-reuse, which would surface as a spurious
 * CannotVerifyCopySource.
 */
const LOOPBACK_HTTPS_AGENTS = new Map<string, Agent>();

/**
 * Build the Agent for a loopback self-request over HTTPS.
 *
 * The request is pinned to the address and port it arrived on, so the peer is
 * necessarily this same server. Rather than turning certificate validation
 * off, trust exactly the one certificate this server presents: it is read
 * from the accepted socket, so a certificate substituted on the wire is still
 * rejected. Azurite is normally run with a self-signed certificate under
 * --cert/--key, which no public trust store would accept.
 *
 * Hostname verification is skipped because the request deliberately targets
 * the bound address rather than a name the certificate could carry, and the
 * pinned certificate already identifies the peer.
 */
function getLoopbackHttpsAgent(socket: TLSSocket): Agent {
  const certificate = socket.getCertificate();
  if (certificate === null || !("raw" in certificate)) {
    throw new Error("Could not read the local TLS certificate");
  }
  const der = certificate.raw.toString("base64");
  let agent = LOOPBACK_HTTPS_AGENTS.get(der);
  if (agent === undefined) {
    const pem =
      `-----BEGIN CERTIFICATE-----\n` +
      `${der.replace(/(.{64})/g, "$1\n")}\n` +
      `-----END CERTIFICATE-----\n`;
    agent = new Agent({ ca: pem, checkServerIdentity: () => undefined });
    LOOPBACK_HTTPS_AGENTS.set(der, agent);
  }
  return agent;
}

/**
 * BlobHandler handles Azure Storage BlockBlob related requests.
 *
 * @export
 * @class BlockBlobHandler
 * @extends {BaseHandler}
 * @implements {IBlockBlobHandler}
 */
export default class BlockBlobHandler
  extends BaseHandler
  implements IBlockBlobHandler {
  public async upload(
    body: NodeJS.ReadableStream,
    contentLength: number,
    options: Models.BlockBlobUploadOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobUploadResponse> {
    // TODO: Check Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = context.startTime!;
    const etag = newEtag();
    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      options.blobHTTPHeaders.blobContentType ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";

    // Per the Put Blob REST contract, x-ms-blob-content-md5 takes precedence
    // over Content-MD5 for transit integrity verification on BlockBlob.
    // Verified live. Prefer the SDK-parsed blobContentMD5 option; fall back
    // to the raw x-ms-blob-content-md5 header (for clients that inject it
    // directly without going through the SDK option); finally fall back to
    // Content-MD5. Malformed values are rejected as InvalidMd5 by the
    // unified validator below (matches real Azure for all three sources).
    const contentMD5 =
      options.blobHTTPHeaders.blobContentMD5 ??
      context.request!.getHeader("x-ms-blob-content-md5") ??
      context.request!.getHeader("content-md5");
    const contentCRC64 = options.transactionalContentCrc64;

    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const persistency = await this.extentStore.appendExtent(
      body,
      context.contextId
    );
    if (persistency.count !== contentLength) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId!,
        `The size of the request body ${persistency.count} mismatches the content-length ${contentLength}.`
      );
    }

    // MD5 is always needed (persisted as the blob's contentMD5 property);
    // CRC64 is computed in the same pass only when the client supplied one.
    const stream = await this.extentStore.readExtent(
      persistency,
      context.contextId
    );
    const { md5: calculatedContentMD5 } =
      await computeAndValidateTransactionalChecksums(
        stream,
        { md5: contentMD5, crc64: contentCRC64 },
        context.contextId,
        { md5: true }
      );

    const blob: BlobModel = {
      deleted: false,
      // Preserve metadata key case
      metadata: convertRawHeadersToMetadata(blobCtx.request!.getRawHeaders(), context.contextId!),
      accountName,
      containerName,
      name: blobName,
      properties: {
        creationTime: date,
        lastModified: date,
        etag,
        contentLength,
        contentType,
        contentEncoding: options.blobHTTPHeaders.blobContentEncoding,
        contentLanguage: options.blobHTTPHeaders.blobContentLanguage,
        contentMD5: calculatedContentMD5,
        contentDisposition: options.blobHTTPHeaders.blobContentDisposition,
        cacheControl: options.blobHTTPHeaders.blobCacheControl,
        blobType: Models.BlobType.BlockBlob,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        serverEncrypted: true,
        accessTier: Models.AccessTier.Hot,
        accessTierInferred: true,
        accessTierChangeTime: date
      },
      snapshot: "",
      isCommitted: true,
      persistency,
      blobTags: options.blobTagsString === undefined ? undefined : getTagsFromString(options.blobTagsString, context.contextId!),
    };

    if (options.tier !== undefined) {
      blob.properties.accessTier = this.parseTier(options.tier);
      if (blob.properties.accessTier === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${options.tier}`
        });
      }
      blob.properties.accessTierInferred = false;
    }
    // TODO: Need a lock for multi keys including containerName and blobName
    // TODO: Provide a specified function.
    await this.metadataStore.createBlob(
      context,
      blob,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.BlockBlobUploadResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: date,
      contentMD5: blob.properties.contentMD5,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }

  public async putBlobFromUrl(
    contentLength: number,
    copySource: string,
    options: Models.BlockBlobPutBlobFromUrlOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobPutBlobFromUrlResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;
    const etag = newEtag();

    // Put Blob From URL carries no request body.
    if (contentLength !== 0) {
      throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
        HeaderName: "Content-Length",
        HeaderValue: contentLength.toString()
      });
    }

    // Reject a malformed source checksum before fetching anything. The
    // shared validator would catch it too, but only once the source had
    // already been read.
    if (
      options.sourceContentMD5 !== undefined &&
      options.sourceContentMD5.length !== 16
    ) {
      throw StorageErrorFactory.getInvalidMd5(context.contextId);
    }

    // The destination's tags are either the source's or the request's, never
    // both.
    const copySourceTags =
      options.copySourceTags === Models.BlobCopySourceTags.COPY;
    if (copySourceTags && options.blobTagsString !== undefined) {
      throw StorageErrorFactory.getBothUserTagsAndSourceTagsCopyPresentException(
        context.contextId!
      );
    }

    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    // Put Blob From URL always copies the whole source, so no range rides
    // along with the conditions.
    const sourceResponse = await this.readCopySource(
      context,
      "putBlobFromUrl",
      copySource,
      BlockBlobHandler.sourceConditionHeaders(
        options.sourceModifiedAccessConditions
      )
    );

    // The status was only the response headers arriving; the body can still
    // fail midway (socket error, connection reset). Map that to the same
    // error as a transport failure rather than letting it escape as a
    // bodiless 500, and release the source stream on the way out.
    let persistency: IExtentChunk;
    try {
      persistency = await this.extentStore.appendExtent(
        sourceResponse.data,
        context.contextId
      );
    } catch (err) {
      sourceResponse.data.destroy();
      this.logger.error(
        `BlockBlobHandler:putBlobFromUrl() Failed to read the copy source body: ${err}`,
        context.contextId
      );
      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        500,
        "Could not verify the copy source within the specified time."
      );
    }

    // The response always echoes an MD5 of what was copied, so it is always
    // computed. x-ms-source-content-md5 is this operation's integrity check
    // over the bytes that arrived; x-ms-blob-content-md5 gets the same
    // treatment Put Blob gives it, since Put Blob From URL follows Put Blob
    // for the custom properties. Destroy the stream regardless, so a
    // mismatch cannot leave the extent handle open.
    const stream = await this.extentStore.readExtent(
      persistency,
      context.contextId
    );
    let calculatedContentMD5: Uint8Array | undefined;
    try {
      ({ md5: calculatedContentMD5 } =
        await computeAndValidateTransactionalChecksums(
          stream,
          {
            md5:
              options.sourceContentMD5 ??
              (options.blobHTTPHeaders || {}).blobContentMD5
          },
          context.contextId,
          { md5: true }
        ));
    } finally {
      (stream as Readable).destroy?.();
    }

    // COPY reads the source's tags over the same authorized path the content
    // came over, so a source that the caller may read but not tag refuses
    // the copy rather than leaking them.
    const blobTags = copySourceTags
      ? await this.readCopySourceTags(context, copySource)
      : options.blobTagsString === undefined
        ? undefined
        : getTagsFromString(options.blobTagsString, context.contextId!);

    // The standard properties are copied from the source unless the request
    // turns that off, and a blob content header on the request sets that one
    // property either way. The request's own Content-Type is only a
    // fallback: a client sends one on a bodiless request without meaning to
    // retype the copy.
    const copyProperties = options.copySourceBlobProperties !== false;
    const sourceProperty = (name: string): string | undefined =>
      copyProperties ? sourceResponse.headers[name] : undefined;
    const blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      blobHTTPHeaders.blobContentType ||
      sourceProperty("content-type") ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";

    // Metadata named on the request replaces the source's rather than adding
    // to it, and naming none copies the source's. Both are read from raw
    // headers, which preserve the case of the names.
    const metadata =
      convertRawHeadersToMetadata(
        blobCtx.request!.getRawHeaders(),
        context.contextId!
      ) ??
      convertRawHeadersToMetadata(
        (sourceResponse.data as IncomingMessage).rawHeaders,
        context.contextId!
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
        // The destination's length is the source's, not the Content-Length
        // of this bodiless request.
        contentLength: persistency.count,
        contentType,
        contentEncoding:
          blobHTTPHeaders.blobContentEncoding ||
          sourceProperty("content-encoding"),
        contentLanguage:
          blobHTTPHeaders.blobContentLanguage ||
          sourceProperty("content-language"),
        contentMD5: calculatedContentMD5,
        contentDisposition:
          blobHTTPHeaders.blobContentDisposition ||
          sourceProperty("content-disposition"),
        cacheControl:
          blobHTTPHeaders.blobCacheControl || sourceProperty("cache-control"),
        blobType: Models.BlobType.BlockBlob,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        serverEncrypted: true,
        accessTier: Models.AccessTier.Hot,
        accessTierInferred: true,
        accessTierChangeTime: date
      },
      snapshot: "",
      isCommitted: true,
      persistency,
      blobTags
    };

    if (options.tier !== undefined) {
      blob.properties.accessTier = this.parseTier(options.tier);
      if (blob.properties.accessTier === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${options.tier}`
        });
      }
      blob.properties.accessTierInferred = false;
    }

    await this.metadataStore.createBlob(
      context,
      blob,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.BlockBlobPutBlobFromUrlResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: date,
      contentMD5: blob.properties.contentMD5,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }

  public async stageBlock(
    blockId: string,
    contentLength: number,
    body: NodeJS.ReadableStream,
    options: Models.BlockBlobStageBlockOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobStageBlockResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    // stageBlock operation doesn't accept blob property headers per the
    // Put Block REST contract: only Content-MD5 and x-ms-content-crc64 are
    // honored. Verified live: real Azure silently ignores x-ms-blob-content-md5
    // here (even malformed values), so don't use it as a fallback source.
    // https://learn.microsoft.com/en-us/rest/api/storageservices/put-block
    const contentMD5 =
      options.transactionalContentMD5 ||
      context.request!.getHeader("content-md5");
    const contentCRC64 = options.transactionalContentCrc64;

    this.validateBlockId(blockId, blobCtx);

    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const persistency = await this.extentStore.appendExtent(
      body,
      context.contextId
    );
    if (persistency.count !== contentLength) {
      // TODO: Confirm error code
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId!,
        `The size of the request body ${persistency.count} mismatches the content-length ${contentLength}.`
      );
    }

    // Per the Put Block REST contract, the service computes a CRC64 of the
    // staged block and echoes it back in x-ms-content-crc64 unless the client
    // supplied a Content-MD5 (Azure rejects supplying both). Compute CRC64
    // whenever no MD5 was supplied, regardless of whether the client supplied
    // a CRC64 themselves.
    const stream = await this.extentStore.readExtent(
      persistency,
      context.contextId
    );
    const { crc64: calculatedCRC64 } =
      await computeAndValidateTransactionalChecksums(
        stream,
        { md5: contentMD5, crc64: contentCRC64 },
        context.contextId,
        { crc64: contentMD5 === undefined }
      );

    const block: BlockModel = {
      accountName,
      containerName,
      blobName,
      isCommitted: false,
      name: blockId,
      size: contentLength,
      persistency
    };

    // TODO: Verify it.
    await this.metadataStore.stageBlock(
      context,
      block,
      options.leaseAccessConditions
    );

    const response: Models.BlockBlobStageBlockResponse = {
      statusCode: 201,
      contentMD5: undefined, // TODO: Block content MD5
      xMsContentCrc64: calculatedCRC64,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }

  public async stageBlockFromURL(
    blockId: string,
    contentLength: number,
    sourceUrl: string,
    options: Models.BlockBlobStageBlockFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobStageBlockFromURLResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    // Put Block From URL carries no request body.
    if (contentLength !== 0) {
      throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
        HeaderName: "Content-Length",
        HeaderValue: contentLength.toString()
      });
    }

    this.validateBlockId(blockId, blobCtx);

    // Reject malformed source checksum headers before fetching anything. The
    // shared validator would catch these too, but it reports the names of the
    // transactional headers, and its errors would surface only after the
    // source had already been read and staged.
    if (
      options.sourceContentMD5 !== undefined &&
      options.sourceContentcrc64 !== undefined
    ) {
      throw StorageErrorFactory.getBothCrc64AndMd5HeaderPresent(
        context.contextId
      );
    }
    if (
      options.sourceContentMD5 !== undefined &&
      options.sourceContentMD5.length !== 16
    ) {
      throw StorageErrorFactory.getInvalidMd5(context.contextId);
    }
    if (
      options.sourceContentcrc64 !== undefined &&
      options.sourceContentcrc64.length < 8
    ) {
      throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
        HeaderName: "x-ms-source-content-crc64",
        HeaderValue: Buffer.from(options.sourceContentcrc64).toString("base64")
      });
    }

    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const headers: { [key: string]: string } = {};
    if (options.sourceRange !== undefined) {
      // The download path ignores malformed Range headers, which would
      // silently stage the entire source blob; reject them up front.
      // Compare offsets as BigInt: they are 64-bit, and Number rounds
      // above 2^53, which would let an end < start range slip through.
      const rangeMatch = /^bytes=(\d+)-(\d*)$/.exec(options.sourceRange);
      if (rangeMatch === null ||
        (rangeMatch[2] !== "" &&
          BigInt(rangeMatch[2]) < BigInt(rangeMatch[1]))) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
          HeaderName: "x-ms-source-range",
          HeaderValue: options.sourceRange
        });
      }
      headers.range = options.sourceRange;
    }
    // Note: unlike the Copy Blob operations, Put Block From URL has no
    // x-ms-source-if-tags condition; the generated operation spec does not
    // deserialize one.
    Object.assign(
      headers,
      BlockBlobHandler.sourceConditionHeaders(
        options.sourceModifiedAccessConditions
      )
    );

    const sourceResponse = await this.readCopySource(
      context,
      "stageBlockFromURL",
      sourceUrl,
      headers
    );

    // The status was only the response headers arriving; the body can
    // still fail midway (socket error, connection reset). Map that to the
    // same error as a transport failure rather than letting it escape as a
    // bodiless 500, and release the source stream on the way out.
    let persistency: IExtentChunk;
    try {
      persistency = await this.extentStore.appendExtent(
        sourceResponse.data,
        context.contextId
      );
    } catch (err) {
      sourceResponse.data.destroy();
      this.logger.error(
        `BlockBlobHandler:stageBlockFromURL() Failed to read the copy source body: ${err}`,
        context.contextId
      );
      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        500,
        "Could not verify the copy source within the specified time."
      );
    }

    // Compare the supplied source checksums against the fetched bytes with
    // the same helper Put Block uses. The response always echoes an MD5, so
    // that one is always computed. A CRC64 is additionally computed - and so
    // additionally echoed - only when no source MD5 was supplied, mirroring
    // stageBlock; the two source checksum headers are mutually exclusive, so
    // a supplied source MD5 means the caller cannot have asked for CRC64.
    // The header shapes were already rejected above, so the only failures
    // left are mismatches, which happen after the stream has been read.
    // Destroy it regardless so a throw cannot leave the extent handle open.
    const stream = await this.extentStore.readExtent(
      persistency,
      context.contextId
    );
    let calculatedContentMD5: Uint8Array | undefined;
    let calculatedContentCRC64: Uint8Array | undefined;
    try {
      ({ md5: calculatedContentMD5, crc64: calculatedContentCRC64 } =
        await computeAndValidateTransactionalChecksums(
          stream,
          {
            md5: options.sourceContentMD5,
            crc64: options.sourceContentcrc64
          },
          context.contextId,
          { md5: true, crc64: options.sourceContentMD5 === undefined }
        ));
    } finally {
      (stream as Readable).destroy?.();
    }

    const block: BlockModel = {
      accountName,
      containerName,
      blobName,
      isCommitted: false,
      name: blockId,
      size: persistency.count,
      persistency
    };

    await this.metadataStore.stageBlock(
      context,
      block,
      options.leaseAccessConditions
    );

    const response: Models.BlockBlobStageBlockFromURLResponse = {
      statusCode: 201,
      contentMD5: calculatedContentMD5,
      xMsContentCrc64: calculatedContentCRC64,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }

  public async commitBlockList(
    blocks: Models.BlockLookupList,
    options: Models.BlockBlobCommitBlockListOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobCommitBlockListResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const request = blobCtx.request!;

    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      options.blobHTTPHeaders.blobContentType || "application/octet-stream";

    // Here we leveraged generated code utils to parser xml
    // Re-parsing request body to get destination blocks
    // We don't leverage serialized blocks parameter because it doesn't include sequence
    const rawBody = request.getBody();
    const badRequestError = StorageErrorFactory.getInvalidOperation(
      blobCtx.contextId!
    );
    if (rawBody === undefined) {
      throw badRequestError;
    }

    let parsed;
    try {
      parsed = await parseXML(rawBody, true);
    } catch (err) {
      // return the 400(InvalidXmlDocument) error for issue 1955
      throw StorageErrorFactory.getInvalidXmlDocument(context.contextId);
    }

    // Validate selected block list
    const commitBlockList = [];

    // $$ is the built-in field of xml2js parsing results when enabling explicitChildrenWithOrder
    // TODO: Should make these fields explicit for parseXML method
    // TODO: What happens when committedBlocks and uncommittedBlocks contains same block ID?
    if (parsed !== undefined && parsed.$$ instanceof Array) {
      for (const block of parsed.$$) {
        const blockID: string | undefined = block._;
        const blockCommitType: string | undefined = block["#name"];

        if (blockID === undefined || blockCommitType === undefined) {
          throw badRequestError;
        }
        commitBlockList.push({
          blockName: blockID,
          blockCommitType
        });
      }
    }

    const blob: BlobModel = {
      accountName,
      containerName,
      name: blobName,
      snapshot: "",
      blobTags: options.blobTagsString === undefined ? undefined : getTagsFromString(options.blobTagsString, context.contextId!),
      properties: {
        lastModified: context.startTime!,
        creationTime: context.startTime!,
        etag: newEtag()
      },
      isCommitted: true
    };

    blob.properties.blobType = Models.BlobType.BlockBlob;
    blob.metadata = convertRawHeadersToMetadata(
      // Preserve metadata key case
      blobCtx.request!.getRawHeaders(), context.contextId!
    );
    blob.properties.accessTier = Models.AccessTier.Hot;
    blob.properties.cacheControl = options.blobHTTPHeaders.blobCacheControl;
    blob.properties.contentType = contentType;
    blob.properties.contentMD5 = options.blobHTTPHeaders.blobContentMD5;
    blob.properties.contentEncoding =
      options.blobHTTPHeaders.blobContentEncoding;
    blob.properties.contentLanguage =
      options.blobHTTPHeaders.blobContentLanguage;
    blob.properties.contentDisposition =
      options.blobHTTPHeaders.blobContentDisposition;

    if (options.tier !== undefined) {
      blob.properties.accessTier = this.parseTier(options.tier);
      if (blob.properties.accessTier === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${options.tier}`
        });
      }
    } else {
      blob.properties.accessTier = Models.AccessTier.Hot;
      blob.properties.accessTierInferred = true;
    }

    await this.metadataStore.commitBlockList(
      context,
      blob,
      commitBlockList,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const contentMD5 = await getMD5FromString(rawBody);

    const response: Models.BlockBlobCommitBlockListResponse = {
      statusCode: 201,
      eTag: blob.properties.etag,
      lastModified: blobCtx.startTime,
      contentMD5,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date: blobCtx.startTime,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };
    return response;
  }

  public async getBlockList(
    options: Models.BlockBlobGetBlockListOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobGetBlockListResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    const res = await this.metadataStore.getBlockList(
      context,
      accountName,
      containerName,
      blobName,
      options.snapshot,
      undefined,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    // TODO: Create uncommitted blockblob when stage block
    // TODO: Conditional headers support?

    res.properties = res.properties || {};
    const response: Models.BlockBlobGetBlockListResponse = {
      statusCode: 200,
      lastModified: res.properties.lastModified,
      eTag: res.properties.etag,
      contentType: res.properties.contentType,
      blobContentLength: res.properties.contentLength,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      committedBlocks: [],
      uncommittedBlocks: []
    };

    if (
      options.listType !== undefined &&
      (options.listType.toLowerCase() ===
        Models.BlockListType.All.toLowerCase() ||
        options.listType.toLowerCase() ===
        Models.BlockListType.Uncommitted.toLowerCase())
    ) {
      response.uncommittedBlocks = res.uncommittedBlocks;
    }
    if (
      options.listType === undefined ||
      options.listType.toLowerCase() ===
      Models.BlockListType.All.toLowerCase() ||
      options.listType.toLowerCase() ===
      Models.BlockListType.Committed.toLowerCase()
    ) {
      response.committedBlocks = res.committedBlocks;
    }
    response.clientRequestId = options.requestId;

    return response;
  }

  /**
   * Get the tier setting from request headers.
   *
   * @private
   * @param {string} tier
   * @returns {(Models.AccessTier | undefined)}
   * @memberof BlobHandler
   */
  private parseTier(tier: string): Models.AccessTier | undefined {
    tier = tier.toLowerCase();
    if (tier === Models.AccessTier.Hot.toLowerCase()) {
      return Models.AccessTier.Hot;
    }
    if (tier === Models.AccessTier.Cool.toLowerCase()) {
      return Models.AccessTier.Cool;
    }
    if (tier === Models.AccessTier.Archive.toLowerCase()) {
      return Models.AccessTier.Archive;
    }
    if (tier === Models.AccessTier.Cold.toLowerCase()) {
      return Models.AccessTier.Cold;
    }
    return undefined;
  }

  private validateBlockId(blockId: string, context: Context): void {
    const rawBlockId = Buffer.from(blockId, "base64");

    if (blockId !== rawBlockId.toString("base64")) {
      throw StorageErrorFactory.getInvalidQueryParameterValue(
        context.contextId,
        "blockid",
        blockId,
        "Not a valid base64 string."
      );
    }

    if (rawBlockId.length > 64) {
      throw StorageErrorFactory.getOutOfRangeInput(
        context.contextId!,
        "blockid",
        blockId,
        "Block ID length cannot exceed 64."
      );
    }
  }

  /**
   * Restate the conditions a copy request names for its source as the
   * conditional headers of a read, so that the download path answers them
   * the way it answers a client reading the source itself.
   *
   * x-ms-if-tags only ever appears for Put Blob From URL: the Put Block From
   * URL specification deserializes no source tag condition.
   *
   * @private
   * @param {Models.SourceModifiedAccessConditions} [conditions]
   * @returns {{ [key: string]: string }}
   * @memberof BlockBlobHandler
   */
  private static sourceConditionHeaders(
    conditions: Models.SourceModifiedAccessConditions = {}
  ): { [key: string]: string } {
    const headers: { [key: string]: string } = {};
    if (conditions.sourceIfMatch !== undefined) {
      headers["if-match"] = conditions.sourceIfMatch;
    }
    if (conditions.sourceIfNoneMatch !== undefined) {
      headers["if-none-match"] = conditions.sourceIfNoneMatch;
    }
    if (conditions.sourceIfModifiedSince !== undefined) {
      headers["if-modified-since"] = new Date(
        conditions.sourceIfModifiedSince
      ).toUTCString();
    }
    if (conditions.sourceIfUnmodifiedSince !== undefined) {
      headers["if-unmodified-since"] = new Date(
        conditions.sourceIfUnmodifiedSince
      ).toUTCString();
    }
    if (conditions.sourceIfTags !== undefined) {
      headers["x-ms-if-tags"] = conditions.sourceIfTags;
    }
    return headers;
  }

  /**
   * Read a copy source with a loopback self-request, so that SAS
   * authentication, ranges, and source conditions are answered by the
   * download path rather than reimplemented against the store.
   *
   * Only sources within the same Azurite instance are supported, as with
   * copyFromURL. The Host header that decides this is the caller's to
   * choose, so the request is never made to the URL they supplied: it is
   * pinned to the address and port this server is bound to and keeps only
   * their path and query, with the source's own host along as a header so
   * that product-style source URLs still resolve their account from it.
   *
   * @private
   * @param {Context} context
   * @param {string} operation Handler method name, for log messages
   * @param {string} copySource The source URL the request named
   * @param {{ [key: string]: string }} headers Conditions, ranges
   * @param {string} [subresource] A query to append, such as "comp=tags"
   * @returns {Promise<AxiosResponse>} A response whose body is a stream
   * @memberof BlockBlobHandler
   */
  private async readCopySource(
    context: Context,
    operation: string,
    copySource: string,
    headers: { [key: string]: string },
    subresource?: string
  ): Promise<AxiosResponse> {
    const blobCtx = new BlobStorageContext(context);

    let url: URL;
    try {
      url = new URL(copySource);
    } catch {
      throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
        HeaderName: "x-ms-copy-source",
        HeaderValue: copySource
      });
    }

    // Hostnames compare case-insensitively and new URL() lowercases its
    // host, so normalize the client-supplied header before comparing.
    const currentServer = (blobCtx.request!.getHeader("Host") || "")
      .toLowerCase();
    if (currentServer !== url.host) {
      this.logger.error(
        `BlockBlobHandler:${operation}() Source ${url} is not on the same Azurite instance as target account ${blobCtx.account}`,
        context.contextId
      );
      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        404,
        "The specified resource does not exist"
      );
    }

    const rawRequest = blobCtx.request!.getBodyStream();
    if (!(rawRequest instanceof IncomingMessage) ||
      rawRequest.socket.localPort === undefined) {
      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        404,
        "The specified resource does not exist"
      );
    }
    const scheme = "encrypted" in rawRequest.socket ? "https" : "http";
    // Use the local address this request arrived on rather than a
    // hard-coded loopback so non-loopback --blobHost binds keep working;
    // IPv6 literals need brackets in URLs.
    const localAddress = rawRequest.socket.localAddress || "127.0.0.1";
    const localHost = localAddress.includes(":") ?
      `[${localAddress}]` : localAddress;
    // Append rather than rebuild the query: a shared access signature signs
    // the exact encoding it arrived in, which re-encoding could disturb.
    const query = subresource === undefined
      ? url.search
      : `${url.search}${url.search === "" ? "?" : "&"}${subresource}`;
    const pinnedUrl =
      `${scheme}://${localHost}:${rawRequest.socket.localPort}` +
      `${url.pathname}${query}`;

    let sourceResponse: AxiosResponse;
    try {
      sourceResponse = await axios.get(pinnedUrl, {
        headers: {
          host: url.host,
          // A copy must carry the bytes the source actually stores, so ask
          // for the body verbatim rather than letting anything in the path
          // apply transfer compression.
          "accept-encoding": "identity",
          ...headers
        },
        responseType: "stream",
        validateStatus: () => true,
        // Never decompress. A source blob carries Content-Encoding as a
        // stored property, so the download echoes it back even though the
        // bytes on the wire are the raw stored ones. Decompressing here
        // would copy the decoded content instead of what the source holds,
        // and would fail outright when the property does not match the
        // bytes.
        decompress: false,
        // Pin trust to the certificate this server itself presents; see
        // getLoopbackHttpsAgent().
        httpsAgent: scheme === "https"
          ? getLoopbackHttpsAgent(rawRequest.socket as TLSSocket)
          : undefined
      });
    } catch (err) {
      // Transport-level failures (TLS, connection reset, socket errors) throw
      // rather than returning a status. Without this they would escape as a
      // bodiless 500 instead of an Azure-shaped error.
      this.logger.error(
        `BlockBlobHandler:${operation}() Failed to read the copy source: ${err}`,
        context.contextId
      );
      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        500,
        "Could not verify the copy source within the specified time."
      );
    }

    if (sourceResponse.status === 304 || sourceResponse.status === 412) {
      sourceResponse.data.destroy();
      throw StorageErrorFactory.getSourceConditionNotMet(context.contextId!);
    }
    if (sourceResponse.status === 404) {
      sourceResponse.data.destroy();
      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        404,
        "The specified resource does not exist"
      );
    }
    if (sourceResponse.status !== 200 && sourceResponse.status !== 206) {
      sourceResponse.data.destroy();
      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        sourceResponse.status,
        "Could not verify the copy source within the specified time."
      );
    }

    return sourceResponse;
  }

  /**
   * Read the tags of a copy source, for the copy that asks to carry them
   * over. Real Azure charges this to the caller as its own Get Blob Tags
   * request against the source, and so does this: the authorization the
   * source URL carries has to allow reading them.
   *
   * @private
   * @param {Context} context
   * @param {string} copySource The source URL the request named
   * @returns {Promise<Models.BlobTags | undefined>}
   * @memberof BlockBlobHandler
   */
  private async readCopySourceTags(
    context: Context,
    copySource: string
  ): Promise<Models.BlobTags | undefined> {
    const response = await this.readCopySource(
      context,
      "putBlobFromUrl",
      copySource,
      {},
      "comp=tags"
    );

    const chunks: Buffer[] = [];
    for await (const chunk of response.data as IncomingMessage) {
      chunks.push(Buffer.from(chunk));
    }
    const parsed = await parseXML(Buffer.concat(chunks).toString());

    // parseXML collapses a single element out of its array, and leaves a
    // tagless source with no TagSet at all.
    const tagSet = parsed.TagSet;
    if (tagSet === undefined || tagSet === "" || tagSet.Tag === undefined) {
      return undefined;
    }
    const tags = Array.isArray(tagSet.Tag) ? tagSet.Tag : [tagSet.Tag];
    return {
      blobTagSet: tags.map((tag: { Key: string; Value: string }) => ({
        key: tag.Key,
        value: tag.Value
      }))
    };
  }
}
