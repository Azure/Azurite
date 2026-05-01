import { Request, Response } from "express";

import logger from "../../../common/Logger";
import IBlobMetadataStore from "../../persistence/IBlobMetadataStore";
import { getDfsContext } from "../DfsContext";
import { createStorageContext } from "../DfsContextFactory";
import { sendDfsError, filesystemNotFound, internalError } from "../DfsErrorFactory";
import { EMULATOR_ACCOUNT_NAME, BLOB_API_VERSION } from "../../utils/constants";
import { newEtag } from "../../../common/utils/utils";
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

    try {
      const userMetadata = this.extractMetadata(req) ?? {};
      // Honor x-ms-namespace-enabled if provided; fall back to server-wide default
      const hnsHeader = req.headers["x-ms-namespace-enabled"] as string | undefined;
      const hns = hnsHeader !== undefined ? hnsHeader === "true" : this.enableHierarchicalNamespace;
      userMetadata["azurite_hns_enabled"] = String(hns);

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
      res.setHeader("Last-Modified", result.properties.lastModified.toUTCString());
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

    try {
      await this.metadataStore.deleteContainer(
        createStorageContext(ctx.requestId),
        account,
        filesystem
      );

      res.status(202);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, filesystemNotFound(filesystem));
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
      res.setHeader("Last-Modified", result.properties.lastModified.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-resource-type", "filesystem");
      // Read per-container HNS flag; fall back to server default when absent (C-3)
      const hns = result.metadata?.["azurite_hns_enabled"] === "true" ||
        (result.metadata?.["azurite_hns_enabled"] === undefined && this.enableHierarchicalNamespace);
      res.setHeader("x-ms-namespace-enabled", String(hns));

      if (result.metadata) {
        // Filter internal reserved key before emitting x-ms-properties (C-4)
        const internalKeys = new Set(["azurite_hns_enabled"]);
        const properties = Object.entries(result.metadata)
          .filter(([key]) => !internalKeys.has(key))
          .map(([key, value]) => `${key}=${Buffer.from(value).toString("base64")}`)
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
    const maxResults = Math.max(1, Math.min(5000, parseInt(req.query.maxResults as string, 10) || 5000));

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
        lastModified: c.properties.lastModified.toUTCString(),
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

    try {
      // Start from existing metadata to preserve azurite_hns_enabled and other keys (P2-C-1, P2-m-3)
      const existing = await this.metadataStore.getContainerProperties(
        createStorageContext(ctx.requestId), account, filesystem
      );
      const metadata: { [key: string]: string } = { ...(existing.metadata || {}) };

      // Overlay x-ms-meta-* headers (filter reserved key to prevent forgery)
      const metaFromHeaders = this.extractMetadata(req) || {};
      for (const [k, v] of Object.entries(metaFromHeaders)) {
        if (k !== "azurite_hns_enabled") metadata[k] = v;
      }

      // Parse x-ms-properties header; filter reserved internal key
      const propertiesHeader = req.headers["x-ms-properties"] as string | undefined;
      if (propertiesHeader) {
        const pairs = propertiesHeader.split(",");
        for (const pair of pairs) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx >= 0) {
            const key = pair.substring(0, eqIdx);
            if (key !== "azurite_hns_enabled") {
              const value = Buffer.from(pair.substring(eqIdx + 1), "base64").toString("utf8");
              metadata[key] = value;
            }
          }
        }
      }

      const etag = newEtag();

      await this.metadataStore.setContainerMetadata(
        createStorageContext(ctx.requestId),
        account,
        filesystem,
        now,
        etag,
        Object.keys(metadata).length > 0 ? metadata : undefined
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
      logger.error(`FilesystemHandler.setProperties error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  private extractMetadata(req: Request): { [key: string]: string } | undefined {
    const metadata: { [key: string]: string } = {};
    let hasMetadata = false;
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase().startsWith("x-ms-meta-") && value) {
        const metaKey = key.substring("x-ms-meta-".length);
        if (metaKey === "azurite_hns_enabled") continue; // reserved — block forgery
        metadata[metaKey] = Array.isArray(value) ? value.join(",") : value;
        hasMetadata = true;
      }
    }
    return hasMetadata ? metadata : undefined;
  }
}
