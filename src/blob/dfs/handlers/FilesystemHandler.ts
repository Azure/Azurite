import { Request, Response } from "express";

import logger from "../../../common/Logger";
import IBlobMetadataStore from "../../persistence/IBlobMetadataStore";
import { getDfsContext } from "../DfsContext";
import { createStorageContext } from "../DfsContextFactory";
import { sendDfsError, filesystemNotFound, internalError } from "../DfsErrorFactory";
import { EMULATOR_ACCOUNT_NAME, BLOB_API_VERSION } from "../../utils/constants";
import * as Models from "../../generated/artifacts/models";

export default class FilesystemHandler {
  public constructor(private readonly metadataStore: IBlobMetadataStore) {}

  public async create(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const now = new Date();
    const etag = `"${now.getTime().toString(16)}"`;

    try {
      const result = await this.metadataStore.createContainer(createStorageContext(ctx.requestId), {
        accountName: account,
        name: filesystem,
        metadata: this.extractMetadata(req),
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
      res.setHeader("x-ms-namespace-enabled", "true");
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
      res.setHeader("x-ms-namespace-enabled", "true");

      if (result.metadata) {
        for (const [key, value] of Object.entries(result.metadata)) {
          res.setHeader(`x-ms-properties-${key}`, Buffer.from(value).toString("base64"));
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
    const maxResults = req.query.maxResults
      ? parseInt(req.query.maxResults as string, 10)
      : 5000;

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
    const etag = `"${now.getTime().toString(16)}"`;

    try {
      const metadata = this.extractMetadata(req) || {};

      // Parse x-ms-properties header (base64 encoded key=value pairs)
      const propertiesHeader = req.headers["x-ms-properties"] as string | undefined;
      if (propertiesHeader) {
        const pairs = propertiesHeader.split(",");
        for (const pair of pairs) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx >= 0) {
            const key = pair.substring(0, eqIdx);
            const value = Buffer.from(pair.substring(eqIdx + 1), "base64").toString("utf8");
            metadata[key] = value;
          }
        }
      }

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
        metadata[metaKey] = Array.isArray(value) ? value.join(",") : value;
        hasMetadata = true;
      }
    }
    return hasMetadata ? metadata : undefined;
  }
}
