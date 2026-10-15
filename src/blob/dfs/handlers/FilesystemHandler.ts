import { Request, Response } from "express";

import logger from "../../../common/Logger";
import IBlobMetadataStore from "../../persistence/IBlobMetadataStore";
import { getDfsContext } from "../DfsContext";
import { createStorageContext } from "../DfsContextFactory";
import { parseDfsProperties } from "../DfsHeaders";
import {
  extractLeaseConditions,
  extractModifiedAccessConditions
} from "../DfsAccessConditions";
import { sendDfsError, filesystemNotFound, internalError } from "../DfsErrorFactory";
import { EMULATOR_ACCOUNT_NAME, BLOB_API_VERSION } from "../../utils/constants";
import { newEtag } from "../../../common/utils/utils";
import {
  HNS_CONTAINER_METADATA_KEY,
  isHierarchicalNamespaceContainer,
  isHnsContainerMetadataKey,
  validateContainerName
} from "../../utils/utils";
import * as Models from "../../generated/artifacts/models";

export default class FilesystemHandler {
  public constructor(
    private readonly metadataStore: IBlobMetadataStore,
    private readonly enableHierarchicalNamespace: boolean = true
  ) {}

  public async create(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const now = new Date();
    const etag = newEtag();

    // Filesystem names follow the container naming rules
    try {
      validateContainerName(ctx.requestId, filesystem);
    } catch (error: any) {
      return sendDfsError(res, {
        statusCode: error.statusCode ?? 400,
        code: error.storageErrorCode ?? "InvalidResourceName",
        message: error.storageErrorMessage ?? "The specified resource name contains invalid characters."
      });
    }

    try {
      const userMetadata = this.extractMetadata(req) ?? {};
      // Properties set at creation (x-ms-properties), except the reserved key
      const properties = parseDfsProperties(req.headers["x-ms-properties"] as string | undefined);
      for (const [key, value] of Object.entries(properties)) {
        if (!isHnsContainerMetadataKey(key)) userMetadata[key] = value;
      }
      // Honor x-ms-namespace-enabled if provided; fall back to server-wide default
      const hnsHeader = req.headers["x-ms-namespace-enabled"] as string | undefined;
      const hns = hnsHeader !== undefined ? hnsHeader.toLowerCase() === "true" : this.enableHierarchicalNamespace;
      userMetadata[HNS_CONTAINER_METADATA_KEY] = String(hns);

      const result = await this.metadataStore.createContainer(createStorageContext(ctx.requestId), {
        accountName: account,
        name: filesystem,
        metadata: userMetadata,
        properties: {
          lastModified: now,
          etag,
          leaseStatus: Models.LeaseStatusType.Unlocked,
          leaseState: Models.LeaseStateType.Available,
          hasImmutabilityPolicy: false,
          hasLegalHold: false
        }
      } as any);

      res.status(201);
      res.setHeader("ETag", result.properties.etag);
      res.setHeader("Last-Modified", new Date(result.properties.lastModified).toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-namespace-enabled", String(hns));
      res.end();
    } catch (error: any) {
      if (error.statusCode === 409) {
        return sendDfsError(res, {
          statusCode: 409,
          code: "FilesystemAlreadyExists",
          message: `The specified filesystem already exists.`
        });
      }
      logger.error(`FilesystemHandler.create error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async delete(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;

    if (!this.isAuthorizedForFilesystemChange(res)) return;

    try {
      await this.metadataStore.deleteContainer(
        createStorageContext(ctx.requestId),
        account,
        filesystem,
        {
          leaseAccessConditions: extractLeaseConditions(req),
          modifiedAccessConditions: extractModifiedAccessConditions(req)
        }
      );

      res.status(202);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, filesystemNotFound(filesystem));
      }
      if (this.isConditionOrLeaseError(error)) {
        return this.sendConditionOrLeaseError(res, error);
      }
      logger.error(`FilesystemHandler.delete error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async getProperties(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;

    try {
      const result = await this.metadataStore.getContainerProperties(
        createStorageContext(ctx.requestId),
        account,
        filesystem
      );

      res.status(200);
      res.setHeader("ETag", result.properties.etag);
      res.setHeader("Last-Modified", new Date(result.properties.lastModified).toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-resource-type", "filesystem");
      // Read per-container HNS flag; fall back to server default when absent (C-3)
      const hns = isHierarchicalNamespaceContainer(result.metadata, this.enableHierarchicalNamespace);
      res.setHeader("x-ms-namespace-enabled", String(hns));

      if (result.metadata) {
        // Filter internal reserved key before emitting x-ms-properties (C-4)
        const properties = Object.entries(result.metadata)
          .filter(([key]) => !isHnsContainerMetadataKey(key))
          .map(([key, value]) => `${key}=${Buffer.from(String(value)).toString("base64")}`)
          .join(",");
        if (properties) {
          res.setHeader("x-ms-properties", properties);
        }
      }

      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, filesystemNotFound(filesystem));
      }
      logger.error(`FilesystemHandler.getProperties error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async list(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;

    const prefix = req.query.prefix as string | undefined;
    const continuation = req.query.continuation as string | undefined;
    // Parse first, then default only on NaN, so an explicit maxResults=0
    // is preserved (and then clamped to the [1..5000] range) instead of
    // being silently treated as "unspecified" and replaced with 5000.
    const parsedMaxResults = parseInt(req.query.maxResults as string, 10);
    const maxResults = Math.max(
      1,
      Math.min(5000, Number.isNaN(parsedMaxResults) ? 5000 : parsedMaxResults)
    );

    try {
      const [containers, nextMarker] = await this.metadataStore.listContainers(
        createStorageContext(ctx.requestId),
        account,
        prefix,
        maxResults,
        continuation
      );

      const filesystems = containers.map(c => ({
        name: c.name,
        lastModified: new Date(c.properties.lastModified).toUTCString(),
        eTag: c.properties.etag
      }));

      res.status(200);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      if (nextMarker) {
        res.setHeader("x-ms-continuation", String(nextMarker));
      }

      res.json({ filesystems });
    } catch (error: any) {
      logger.error(`FilesystemHandler.list error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async setProperties(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const now = new Date();

    if (!this.isAuthorizedForFilesystemChange(res)) return;

    try {
      // Like ADLS Gen2, the request replaces the properties of the filesystem:
      // the properties it doesn't list are removed. Only the internal
      // azurite_hns_enabled flag is kept (P2-C-1).
      const existing = await this.metadataStore.getContainerProperties(
        createStorageContext(ctx.requestId), account, filesystem
      );
      const metadata: { [key: string]: string } = {};
      const hnsKey = Object.keys(existing.metadata || {}).find(isHnsContainerMetadataKey);
      if (hnsKey !== undefined) {
        metadata[HNS_CONTAINER_METADATA_KEY] = existing.metadata![hnsKey];
      }

      // x-ms-meta-* headers and x-ms-properties, without the reserved key
      Object.assign(metadata, this.extractMetadata(req) || {});
      for (const [key, value] of Object.entries(parseDfsProperties(req.headers["x-ms-properties"] as string | undefined))) {
        if (!isHnsContainerMetadataKey(key)) metadata[key] = value;
      }

      const etag = newEtag();

      await this.metadataStore.setContainerMetadata(
        createStorageContext(ctx.requestId),
        account,
        filesystem,
        now,
        etag,
        Object.keys(metadata).length > 0 ? metadata : undefined,
        extractLeaseConditions(req),
        extractModifiedAccessConditions(req)
      );

      res.status(200);
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", now.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, filesystemNotFound(filesystem));
      }
      if (this.isConditionOrLeaseError(error)) {
        return this.sendConditionOrLeaseError(res, error);
      }
      logger.error(`FilesystemHandler.setProperties error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  /**
   * In ACL mode (a Bearer caller with an identity), deleting a filesystem or
   * changing its properties requires a role in ADLS Gen2, which the emulator
   * doesn't model: only $superuser may do it, as path ACLs don't grant it.
   * Sends a 403 error response and returns false when denied.
   */
  private isAuthorizedForFilesystemChange(res: Response): boolean {
    const identity = getDfsContext(res).identity;
    if (!identity || (identity.oid || identity.upn) === "$superuser") {
      return true;
    }
    sendDfsError(res, {
      statusCode: 403,
      code: "AuthorizationPermissionMismatch",
      message: "This request is not authorized to perform this operation using this permission. Only $superuser may delete a filesystem or change its properties."
    });
    return false;
  }

  private isConditionOrLeaseError(error: any): boolean {
    return error.statusCode === 409 || error.statusCode === 412;
  }

  /**
   * Send a failed conditional header or lease check with its storage error code
   * (e.g. ConditionNotMet, LeaseIdMissing, LeaseIdMismatchWithContainerOperation).
   */
  private sendConditionOrLeaseError(res: Response, error: any): void {
    sendDfsError(res, {
      statusCode: error.statusCode,
      code: error.storageErrorCode || "ConditionNotMet",
      message: error.storageErrorMessage || "The condition specified using HTTP conditional header(s) is not met."
    });
  }

  private extractMetadata(req: Request): { [key: string]: string } | undefined {
    const metadata: { [key: string]: string } = {};
    let hasMetadata = false;
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase().startsWith("x-ms-meta-") && value) {
        const metaKey = key.substring("x-ms-meta-".length);
        if (isHnsContainerMetadataKey(metaKey)) continue; // reserved — block forgery
        metadata[metaKey] = Array.isArray(value) ? value.join(",") : value;
        hasMetadata = true;
      }
    }
    return hasMetadata ? metadata : undefined;
  }
}
