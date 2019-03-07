import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlobHandler from "../generated/handlers/IBlobHandler";
import { API_VERSION } from "../utils/constants";
import BaseHandler from "./BaseHandler";

// tslint:disable:object-literal-sort-keys

export default class BlobHandler extends BaseHandler implements IBlobHandler {
  // TODO: Implement download cross blocks; Implement page blob download and append blob download;
  // TODO: Implement partial download
  public async download(
    options: Models.BlobDownloadOptionalParams,
    context: Context
  ): Promise<Models.BlobDownloadResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;

    const container = await this.dataStore.getContainer(containerName);
    if (!container) {
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    const blob = await this.dataStore.getBlob(containerName, blobName);
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }

    const body = await this.dataStore.readPayload(blob.persistencyID);
    const response: Models.BlobDownloadResponse = {
      statusCode: 200,
      body,
      metadata: blob.metadata,
      ...blob.properties,
      eTag: blob.properties.etag,
      requestId: blobCtx.contextID,
      date: new Date(),
      version: API_VERSION
    };

    return response;
  }

  public async getProperties(
    options: Models.BlobGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.BlobGetPropertiesResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async delete(
    options: Models.BlobDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.BlobDeleteResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;

    const container = await this.dataStore.getContainer(containerName);
    if (!container) {
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    const blob = await this.dataStore.getBlob(containerName, blobName);
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }

    await this.dataStore.deleteBlob(containerName, blobName);

    const response: Models.BlobDeleteResponse = {
      statusCode: 202,
      requestId: blobCtx.contextID,
      date: new Date(),
      version: API_VERSION
    };

    return response;
  }

  public async undelete(
    options: Models.BlobUndeleteOptionalParams,
    context: Context
  ): Promise<Models.BlobUndeleteResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async setHTTPHeaders(
    options: Models.BlobSetHTTPHeadersOptionalParams,
    context: Context
  ): Promise<Models.BlobSetHTTPHeadersResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async setMetadata(
    options: Models.BlobSetMetadataOptionalParams,
    context: Context
  ): Promise<Models.BlobSetMetadataResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async acquireLease(
    options: Models.BlobAcquireLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobAcquireLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async releaseLease(
    leaseId: string,
    options: Models.BlobReleaseLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobReleaseLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async renewLease(
    leaseId: string,
    options: Models.BlobRenewLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobRenewLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async changeLease(
    leaseId: string,
    proposedLeaseId: string,
    options: Models.BlobChangeLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobChangeLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async breakLease(
    options: Models.BlobBreakLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobBreakLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async createSnapshot(
    options: Models.BlobCreateSnapshotOptionalParams,
    context: Context
  ): Promise<Models.BlobCreateSnapshotResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async startCopyFromURL(
    copySource: string,
    options: Models.BlobStartCopyFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlobStartCopyFromURLResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async abortCopyFromURL(
    copyId: string,
    options: Models.BlobAbortCopyFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlobAbortCopyFromURLResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async setTier(
    tier: Models.AccessTier,
    options: Models.BlobSetTierOptionalParams,
    context: Context
  ): Promise<Models.BlobSetTierResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async getAccountInfo(
    context: Context
  ): Promise<Models.BlobGetAccountInfoResponse> {
    throw new NotImplementedError(context.contextID);
  }
}
