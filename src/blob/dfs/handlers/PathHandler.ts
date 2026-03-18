import { Request, Response } from "express";

import logger from "../../../common/Logger";
import { OAuthLevel } from "../../../common/models";
import IExtentStore from "../../../common/persistence/IExtentStore";
import IBlobMetadataStore, {
  BlobModel,
  BlockModel
} from "../../persistence/IBlobMetadataStore";
import { getDfsContext, IDfsContext } from "../DfsContext";
import {
  sendDfsError,
  pathNotFound,
  filesystemNotFound,
  directoryNotEmpty,
  internalError,
  invalidSourceOrDestination
} from "../DfsErrorFactory";
import {
  EMULATOR_ACCOUNT_NAME,
  BLOB_API_VERSION
} from "../../utils/constants";
import * as Models from "../../generated/artifacts/models";
import { createStorageContext } from "../DfsContextFactory";
import { checkAcl, AclPermission } from "../DfsAclEnforcer";

const HNS_DIRECTORY_METADATA_KEY = "hdi_isfolder";

export default class PathHandler {
  public constructor(
    private readonly metadataStore: IBlobMetadataStore,
    private readonly extentStore: IExtentStore,
    private readonly oauth?: OAuthLevel
  ) {}

  public async create(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;
    const resource = req.query.resource as string | undefined;
    const isDirectory = resource === "directory";

    const renameSource = req.headers["x-ms-rename-source"] as string | undefined;
    if (renameSource) {
      return this.renamePath(req, res);
    }

    try {
      const now = new Date();
      const metadata: { [key: string]: string } = {};
      if (isDirectory) {
        metadata[HNS_DIRECTORY_METADATA_KEY] = "true";
      }

      // Ensure intermediate directories exist
      if (pathName.includes("/")) {
        await this.ensureIntermediateDirectories(account, filesystem, pathName, now);
      }

      const blobModel: BlobModel = {
        accountName: account,
        containerName: filesystem,
        name: pathName,
        snapshot: "",
        isCommitted: true,
        properties: {
          lastModified: now,
          etag: `"${new Date().getTime().toString(16)}"`,
          contentLength: 0,
          contentType: isDirectory ? undefined : "application/octet-stream",
          blobType: Models.BlobType.BlockBlob,
          accessTier: Models.AccessTier.Hot,
          accessTierInferred: true,
          creationTime: now,
          legalHold: false
        },
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        committedBlocksInOrder: [],
        persistency: undefined as any
      };

      await this.metadataStore.createBlob(createStorageContext(ctx.requestId), blobModel);

      // Register in HNS hierarchy table
      const parentPath = pathName.includes("/")
        ? pathName.substring(0, pathName.lastIndexOf("/"))
        : null;
      await this.metadataStore.registerHnsPath(
        createStorageContext(ctx.requestId), account, filesystem,
        pathName, parentPath, isDirectory
      );

      res.status(201);
      res.setHeader("ETag", blobModel.properties.etag!);
      res.setHeader("Last-Modified", now.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("Content-Length", "0");
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, filesystemNotFound(filesystem));
      }
      logger.error(`PathHandler.create error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async delete(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;
    const recursive = req.query.recursive === "true";

    // ACL enforcement
    if (!(await this.enforceAcl(ctx, res, account, filesystem, pathName, "w"))) return;

    try {
      // Check if it's a directory
      const blobProps = await this.safeGetBlobProperties(account, filesystem, pathName);
      if (!blobProps) {
        return sendDfsError(res, pathNotFound(pathName));
      }

      const isDir = blobProps.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true";

      if (isDir) {
        // List ALL blobs under this directory prefix (recursive, no delimiter)
        // to check for children. This catches blobs created via both DFS and
        // Blob API, regardless of whether they're in the HNS hierarchy table.
        const prefix = pathName + "/";
        const [allChildren] = await this.metadataStore.listBlobs(
          createStorageContext(ctx.requestId), account, filesystem,
          undefined, undefined, prefix
        );

        if (allChildren.length > 0 && !recursive) {
          return sendDfsError(res, directoryNotEmpty(pathName));
        }

        if (recursive && allChildren.length > 0) {
          // Delete all descendant blobs
          for (const child of allChildren) {
            await this.metadataStore.deleteBlob(
              createStorageContext(ctx.requestId), account, filesystem, child.name, {}
            );
          }
          // Unregister all descendants from HNS hierarchy
          await this.metadataStore.unregisterHnsPathsByPrefix(
            createStorageContext(ctx.requestId), account, filesystem, prefix
          );
        }
      }

      const leaseConditions = this.extractLeaseConditions(req);
      const modifiedConditions = this.extractModifiedAccessConditions(req);
      await this.metadataStore.deleteBlob(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        {
          leaseAccessConditions: leaseConditions,
          modifiedAccessConditions: modifiedConditions
        }
      );

      // Unregister from HNS hierarchy
      await this.metadataStore.unregisterHnsPath(
        createStorageContext(ctx.requestId), account, filesystem, pathName
      );

      res.status(200);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      logger.error(`PathHandler.delete error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async getProperties(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;
    const action = req.query.action as string | undefined;

    // ACL enforcement
    if (!(await this.enforceAcl(ctx, res, account, filesystem, pathName, "r"))) return;

    try {
      const leaseConditions = this.extractLeaseConditions(req);
      const modifiedConditions = this.extractModifiedAccessConditions(req);
      const result = await this.metadataStore.getBlobProperties(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        undefined, leaseConditions, modifiedConditions
      );

      const isDir = result.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true";

      res.status(200);
      res.setHeader("ETag", result.properties.etag!);
      res.setHeader("Last-Modified", result.properties.lastModified.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-resource-type", isDir ? "directory" : "file");

      if (!isDir) {
        res.setHeader("Content-Length", String(result.properties.contentLength || 0));
        if (result.properties.contentType) {
          res.setHeader("Content-Type", result.properties.contentType);
        }
      } else {
        res.setHeader("Content-Length", "0");
      }

      // ACL headers
      if (action === "getAccessControl") {
        res.setHeader("x-ms-owner", (result.metadata as any)?.dfsAclOwner || "$superuser");
        res.setHeader("x-ms-group", (result.metadata as any)?.dfsAclGroup || "$superuser");
        res.setHeader("x-ms-permissions", (result.metadata as any)?.dfsAclPermissions || "rwxr-x---");
        if ((result.metadata as any)?.dfsAcl) {
          res.setHeader("x-ms-acl", (result.metadata as any).dfsAcl);
        }
      }

      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      logger.error(`PathHandler.getProperties error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async read(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    // ACL enforcement
    if (!(await this.enforceAcl(ctx, res, account, filesystem, pathName, "r"))) return;

    try {
      const leaseConditions = this.extractLeaseConditions(req);
      const modifiedConditions = this.extractModifiedAccessConditions(req);
      const blob = await this.metadataStore.downloadBlob(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        undefined, leaseConditions, modifiedConditions
      );

      res.status(200);
      res.setHeader("ETag", blob.properties.etag!);
      res.setHeader("Last-Modified", blob.properties.lastModified.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-resource-type", "file");
      res.setHeader("Content-Length", String(blob.properties.contentLength || 0));

      if (blob.properties.contentType) {
        res.setHeader("Content-Type", blob.properties.contentType);
      }

      const hasCommittedBlocks = blob.committedBlocksInOrder && blob.committedBlocksInOrder.length > 0;
      if (blob.properties.contentLength === 0 && !hasCommittedBlocks) {
        return res.end();
      }

      // Read from extent store
      if (hasCommittedBlocks) {
        // Multi-block blob: read each block in order
        for (const block of blob.committedBlocksInOrder!) {
          const stream = await this.extentStore.readExtent(block.persistency);
          await new Promise<void>((resolve, reject) => {
            stream.on("data", (chunk: Buffer) => res.write(chunk));
            stream.on("end", resolve);
            stream.on("error", reject);
          });
        }
        res.end();
      } else if (blob.persistency) {
        const stream = await this.extentStore.readExtent(blob.persistency);
        await new Promise<void>((resolve, reject) => {
          stream.on("end", () => { res.end(); resolve(); });
          stream.on("error", reject);
          stream.pipe(res);
        });
      } else {
        res.end();
      }
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      logger.error(`PathHandler.read error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async listPaths(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const directory = req.query.directory as string | undefined;
    const recursive = req.query.recursive === "true";
    const maxResults = req.query.maxResults
      ? parseInt(req.query.maxResults as string, 10)
      : 5000;
    const continuation = req.query.continuation as string | undefined;

    const prefix = directory ? (directory.endsWith("/") ? directory : directory + "/") : "";
    const delimiter = recursive ? undefined : "/";

    try {
      const [blobs, prefixes, nextMarker] = await this.metadataStore.listBlobs(
        createStorageContext(ctx.requestId), account, filesystem, delimiter, undefined,
        prefix, maxResults, continuation
      );

      const paths: any[] = [];

      for (const blob of blobs) {
        // Skip the directory marker itself if it matches prefix exactly
        if (blob.name === directory) continue;

        const isDir = blob.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true";
        paths.push({
          name: blob.name,
          isDirectory: isDir || false,
          lastModified: blob.properties.lastModified.toUTCString(),
          eTag: blob.properties.etag,
          contentLength: isDir ? 0 : (blob.properties.contentLength || 0),
          owner: "$superuser",
          group: "$superuser",
          permissions: "rwxr-x---"
        });
      }

      // Add prefixes as directories (for non-recursive listing)
      if (prefixes) {
        for (const p of prefixes) {
          paths.push({
            name: p.name.endsWith("/") ? p.name.slice(0, -1) : p.name,
            isDirectory: true,
            lastModified: new Date().toUTCString(),
            contentLength: 0,
            owner: "$superuser",
            group: "$superuser",
            permissions: "rwxr-x---"
          });
        }
      }

      res.status(200);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      if (nextMarker) {
        res.setHeader("x-ms-continuation", nextMarker);
      }

      res.json({ paths });
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, filesystemNotFound(filesystem));
      }
      logger.error(`PathHandler.listPaths error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async update(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    // ACL enforcement for update operations
    if (!(await this.enforceAcl(ctx, res, account, filesystem, pathName, "w"))) return;

    const action = req.query.action as string;
    switch (action) {
      case "append":
        return this.appendData(req, res);
      case "flush":
        return this.flushData(req, res);
      case "setAccessControl":
        return this.setAccessControl(req, res);
      case "setAccessControlRecursive":
        return this.setAccessControlRecursive(req, res);
      case "setProperties":
        return this.setProperties(req, res);
      default:
        return sendDfsError(res, {
          statusCode: 400,
          code: "InvalidQueryParameterValue",
          message: `Value for one of the query parameters specified in the request URI is invalid. QueryParameterName: action, QueryParameterValue: ${action}`
        });
    }
  }

  private async appendData(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;
    const position = parseInt(req.query.position as string || "0", 10);

    try {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");

      // Content-MD5 validation
      const contentMD5 = req.headers["content-md5"] as string | undefined;
      if (contentMD5) {
        const crypto = require("crypto");
        const computedMD5 = crypto.createHash("md5").update(body).digest("base64");
        if (computedMD5 !== contentMD5) {
          return sendDfsError(res, {
            statusCode: 400,
            code: "Md5Mismatch",
            message: "The MD5 value specified in the request did not match with the MD5 value calculated by the server."
          });
        }
      }

      if (body.length === 0) {
        res.status(202);
        res.setHeader("x-ms-request-id", ctx.requestId);
        res.setHeader("x-ms-version", BLOB_API_VERSION);
        return res.end();
      }

      // Write to extent store
      const extentChunk = await this.extentStore.appendExtent(body);

      // Stage as an uncommitted block (reusing block blob infrastructure)
      const blockId = Buffer.from(
        `dfs-${position.toString().padStart(20, "0")}`
      ).toString("base64");

      const block: BlockModel = {
        accountName: account,
        containerName: filesystem,
        blobName: pathName,
        isCommitted: false,
        name: blockId,
        size: body.length,
        persistency: extentChunk
      };

      await this.metadataStore.stageBlock(
        createStorageContext(ctx.requestId), block, undefined
      );

      res.status(202);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-content-length", String(body.length));
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      logger.error(`PathHandler.appendData error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  private async flushData(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;
    const position = parseInt(req.query.position as string || "0", 10);

    try {
      // Get current blob to find uncommitted blocks
      const blob = await this.metadataStore.downloadBlob(
        createStorageContext(ctx.requestId), account, filesystem, pathName, undefined
      );

      // Get uncommitted blocks
      const blockList = await this.metadataStore.getBlockList(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        undefined, undefined, undefined, undefined
      );

      if (!blockList.uncommittedBlocks || blockList.uncommittedBlocks.length === 0) {
        // Nothing to flush — just update the blob
        res.status(200);
        res.setHeader("ETag", blob.properties.etag!);
        res.setHeader("Last-Modified", blob.properties.lastModified.toUTCString());
        res.setHeader("x-ms-request-id", ctx.requestId);
        res.setHeader("x-ms-version", BLOB_API_VERSION);
        return res.end();
      }

      // Build commit block list from uncommitted blocks
      const commitList = blockList.uncommittedBlocks.map(b => ({
        blockName: b.name,
        blockCommitType: "Uncommitted"
      }));

      const now = new Date();
      const etag = `"${now.getTime().toString(16)}"`;

      const updatedBlob: BlobModel = {
        ...blob,
        properties: {
          ...blob.properties,
          lastModified: now,
          etag,
          contentLength: position,
          contentType: blob.properties.contentType || "application/octet-stream"
        }
      };

      await this.metadataStore.commitBlockList(
        createStorageContext(ctx.requestId), updatedBlob, commitList
      );

      res.status(200);
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", now.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-resource-type", "file");
      res.setHeader("Content-Length", "0");
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      logger.error(`PathHandler.flushData error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  private async setAccessControl(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    try {
      const result = await this.metadataStore.getBlobProperties(
        createStorageContext(ctx.requestId), account, filesystem, pathName, undefined, undefined
      );

      // Store ACL info in metadata
      const metadata = { ...(result.metadata || {}) };
      const owner = req.headers["x-ms-owner"] as string | undefined;
      const group = req.headers["x-ms-group"] as string | undefined;
      const permissions = req.headers["x-ms-permissions"] as string | undefined;
      const acl = req.headers["x-ms-acl"] as string | undefined;

      if (owner) metadata["dfsAclOwner"] = owner;
      if (group) metadata["dfsAclGroup"] = group;
      if (permissions) metadata["dfsAclPermissions"] = permissions;
      if (acl) metadata["dfsAcl"] = acl;

      const now = new Date();
      const etag = `"${now.getTime().toString(16)}"`;

      await this.metadataStore.setBlobMetadata(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        undefined, metadata
      );

      res.status(200);
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", now.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      logger.error(`PathHandler.setAccessControl error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  private async setAccessControlRecursive(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;
    const mode = req.query.mode as string || "set"; // set, modify, remove
    const acl = req.headers["x-ms-acl"] as string | undefined;
    const maxRecords = req.query.maxRecords
      ? parseInt(req.query.maxRecords as string, 10)
      : 2000;
    const continuation = req.query.continuation as string | undefined;

    try {
      const prefix = pathName.endsWith("/") ? pathName : pathName + "/";

      const [blobs, , nextMarker] = await this.metadataStore.listBlobs(
        createStorageContext(ctx.requestId), account, filesystem,
        undefined, undefined, prefix, maxRecords, continuation
      );

      let directoriesSuccessful = 0;
      let filesSuccessful = 0;
      const failureCount = 0;

      // Also apply to the path itself
      const allPaths = [pathName, ...blobs.map(b => b.name)];

      for (const blobPath of allPaths) {
        try {
          const props = await this.metadataStore.getBlobProperties(
            createStorageContext(ctx.requestId), account, filesystem,
            blobPath, undefined, undefined
          );

          const metadata = { ...(props.metadata || {}) };
          const isDir = metadata[HNS_DIRECTORY_METADATA_KEY] === "true";

          if (acl) {
            if (mode === "set") {
              metadata["dfsAcl"] = acl;
            } else if (mode === "modify") {
              // Merge: new ACL entries override existing ones with same qualifier
              const existing = (metadata["dfsAcl"] || "").split(",").filter(Boolean);
              const incoming = acl.split(",");
              const merged = new Map<string, string>();
              for (const entry of existing) {
                const key = entry.split(":").slice(0, 2).join(":");
                merged.set(key, entry);
              }
              for (const entry of incoming) {
                const key = entry.split(":").slice(0, 2).join(":");
                merged.set(key, entry);
              }
              metadata["dfsAcl"] = Array.from(merged.values()).join(",");
            } else if (mode === "remove") {
              // Remove specified ACL entries
              const existing = (metadata["dfsAcl"] || "").split(",").filter(Boolean);
              const toRemove = new Set(acl.split(",").map((e: string) => e.split(":").slice(0, 2).join(":")));
              metadata["dfsAcl"] = existing
                .filter((e: string) => !toRemove.has(e.split(":").slice(0, 2).join(":")))
                .join(",");
            }
          }

          await this.metadataStore.setBlobMetadata(
            createStorageContext(ctx.requestId), account, filesystem,
            blobPath, undefined, metadata
          );

          if (isDir) {
            directoriesSuccessful++;
          } else {
            filesSuccessful++;
          }
        } catch {
          // Skip failures for individual paths
        }
      }

      res.status(200);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      if (nextMarker) {
        res.setHeader("x-ms-continuation", nextMarker);
      }

      res.json({
        directoriesSuccessful,
        filesSuccessful,
        failureCount
      });
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      logger.error(`PathHandler.setAccessControlRecursive error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  private async setProperties(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    try {
      const result = await this.metadataStore.getBlobProperties(
        createStorageContext(ctx.requestId), account, filesystem, pathName, undefined, undefined
      );

      const metadata = { ...(result.metadata || {}) };

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

      const now = new Date();
      const etag = `"${now.getTime().toString(16)}"`;

      await this.metadataStore.setBlobMetadata(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        undefined, metadata
      );

      res.status(200);
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", now.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      logger.error(`PathHandler.setProperties error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async lease(req: Request, res: Response): Promise<void> {
    const leaseAction = (req.headers["x-ms-lease-action"] as string || "").toLowerCase();
    switch (leaseAction) {
      case "acquire":
        return this.acquireLease(req, res);
      case "release":
        return this.releaseLease(req, res);
      case "renew":
        return this.renewLease(req, res);
      case "break":
        return this.breakLease(req, res);
      case "change":
        return this.changeLease(req, res);
      default:
        return sendDfsError(res, {
          statusCode: 400,
          code: "InvalidHeaderValue",
          message: `The value for one of the HTTP headers is not in the correct format. Header: x-ms-lease-action, Value: ${leaseAction}`
        });
    }
  }

  private async acquireLease(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    try {
      const duration = parseInt(req.headers["x-ms-lease-duration"] as string || "-1", 10);
      const proposedLeaseId = req.headers["x-ms-proposed-lease-id"] as string | undefined;
      const modifiedConditions = this.extractModifiedAccessConditions(req);

      const result = await this.metadataStore.acquireBlobLease(
        createStorageContext(ctx.requestId),
        account, filesystem, pathName, duration, proposedLeaseId,
        { modifiedAccessConditions: modifiedConditions }
      );

      res.status(201);
      res.setHeader("ETag", result.properties.etag!);
      res.setHeader("Last-Modified", result.properties.lastModified.toUTCString());
      res.setHeader("x-ms-lease-id", result.leaseId!);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      this.handleLeaseError(res, error, ctx.requestId, pathName);
    }
  }

  private async releaseLease(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    try {
      const leaseId = req.headers["x-ms-lease-id"] as string;
      const modifiedConditions = this.extractModifiedAccessConditions(req);

      await this.metadataStore.releaseBlobLease(
        createStorageContext(ctx.requestId),
        account, filesystem, pathName, leaseId,
        { modifiedAccessConditions: modifiedConditions }
      );

      res.status(200);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      this.handleLeaseError(res, error, ctx.requestId, pathName);
    }
  }

  private async renewLease(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    try {
      const leaseId = req.headers["x-ms-lease-id"] as string;
      const modifiedConditions = this.extractModifiedAccessConditions(req);

      const result = await this.metadataStore.renewBlobLease(
        createStorageContext(ctx.requestId),
        account, filesystem, pathName, leaseId,
        { modifiedAccessConditions: modifiedConditions }
      );

      res.status(200);
      res.setHeader("ETag", result.properties.etag!);
      res.setHeader("Last-Modified", result.properties.lastModified.toUTCString());
      res.setHeader("x-ms-lease-id", result.leaseId!);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      this.handleLeaseError(res, error, ctx.requestId, pathName);
    }
  }

  private async breakLease(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    try {
      const breakPeriod = req.headers["x-ms-lease-break-period"]
        ? parseInt(req.headers["x-ms-lease-break-period"] as string, 10)
        : undefined;
      const modifiedConditions = this.extractModifiedAccessConditions(req);

      const result = await this.metadataStore.breakBlobLease(
        createStorageContext(ctx.requestId),
        account, filesystem, pathName, breakPeriod,
        { modifiedAccessConditions: modifiedConditions }
      );

      res.status(202);
      res.setHeader("ETag", result.properties.etag!);
      res.setHeader("Last-Modified", result.properties.lastModified.toUTCString());
      if (result.leaseTime !== undefined) {
        res.setHeader("x-ms-lease-time", String(result.leaseTime));
      }
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      this.handleLeaseError(res, error, ctx.requestId, pathName);
    }
  }

  private async changeLease(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    try {
      const leaseId = req.headers["x-ms-lease-id"] as string;
      const proposedLeaseId = req.headers["x-ms-proposed-lease-id"] as string;
      const modifiedConditions = this.extractModifiedAccessConditions(req);

      const result = await this.metadataStore.changeBlobLease(
        createStorageContext(ctx.requestId),
        account, filesystem, pathName, leaseId, proposedLeaseId,
        { modifiedAccessConditions: modifiedConditions }
      );

      res.status(200);
      res.setHeader("ETag", result.properties.etag!);
      res.setHeader("Last-Modified", result.properties.lastModified.toUTCString());
      res.setHeader("x-ms-lease-id", result.leaseId!);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      this.handleLeaseError(res, error, ctx.requestId, pathName);
    }
  }

  private handleLeaseError(res: Response, error: any, requestId: string, pathName: string): void {
    if (error.statusCode === 404) {
      return sendDfsError(res, pathNotFound(pathName));
    }
    if (error.statusCode === 409 || error.statusCode === 412) {
      return sendDfsError(res, {
        statusCode: error.statusCode,
        code: error.storageErrorCode || error.code || "LeaseOperationFailed",
        message: error.storageErrorMessage || error.message
      });
    }
    logger.error(`PathHandler.lease error: ${error.message}`, requestId);
    sendDfsError(res, internalError(error.message));
  }

  private async renamePath(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const destFilesystem = ctx.filesystem!;
    const destPath = ctx.path!;
    const renameSource = req.headers["x-ms-rename-source"] as string;

    try {
      // Parse rename source: /{filesystem}/{path}?sastoken
      const sourceUrl = new URL(renameSource, "http://localhost");
      const sourceParts = sourceUrl.pathname.split("/").filter(p => p);

      // Handle both /{account}/{filesystem}/{path} and /{filesystem}/{path}
      let sourceFilesystem: string;
      let sourcePath: string;
      if (sourceParts.length >= 3 && sourceParts[0] === account) {
        sourceFilesystem = sourceParts[1];
        sourcePath = sourceParts.slice(2).join("/");
      } else if (sourceParts.length >= 2) {
        sourceFilesystem = sourceParts[0];
        sourcePath = sourceParts.slice(1).join("/");
      } else {
        return sendDfsError(res, invalidSourceOrDestination(
          `Invalid rename source: ${renameSource}`
        ));
      }

      // Get source blob to check if it exists and whether it's a directory
      const sourceBlob = await this.safeGetBlobProperties(account, sourceFilesystem, sourcePath);
      if (!sourceBlob) {
        return sendDfsError(res, pathNotFound(sourcePath));
      }

      const isDir = sourceBlob.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true";

      if (isDir) {
        // Atomically rename all children by prefix
        await this.metadataStore.renameBlobsByPrefix(
          createStorageContext(ctx.requestId),
          account,
          sourceFilesystem,
          sourcePath + "/",
          destFilesystem,
          destPath + "/"
        );
      }

      // Atomically rename the path itself (file or directory marker)
      const result = await this.metadataStore.renameBlob(
        createStorageContext(ctx.requestId),
        account,
        sourceFilesystem,
        sourcePath,
        destFilesystem,
        destPath
      );

      const now = new Date();

      // Update HNS hierarchy for the renamed paths
      await this.metadataStore.renameHnsPaths(
        createStorageContext(ctx.requestId),
        account, sourceFilesystem, sourcePath,
        destFilesystem, destPath
      );

      // Ensure intermediate directories for destination
      if (destPath.includes("/")) {
        await this.ensureIntermediateDirectories(account, destFilesystem, destPath, now);
      }

      res.status(201);
      res.setHeader("ETag", result.etag!);
      res.setHeader("Last-Modified", result.lastModified!.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("Content-Length", "0");
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(renameSource));
      }
      logger.error(`PathHandler.renamePath error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  private async ensureIntermediateDirectories(
    account: string,
    filesystem: string,
    pathName: string,
    now: Date
  ): Promise<void> {
    const parts = pathName.split("/");
    // Skip the last part (the file/dir being created)
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/");
      const existing = await this.safeGetBlobProperties(account, filesystem, dirPath);
      if (!existing) {
        const dirBlob: BlobModel = {
          accountName: account,
          containerName: filesystem,
          name: dirPath,
          snapshot: "",
          isCommitted: true,
          properties: {
            lastModified: now,
            etag: `"${now.getTime().toString(16)}-${i}"`,
            contentLength: 0,
            blobType: Models.BlobType.BlockBlob,
            accessTier: Models.AccessTier.Hot,
            accessTierInferred: true,
            creationTime: now,
            legalHold: false
          },
          metadata: { [HNS_DIRECTORY_METADATA_KEY]: "true" },
          committedBlocksInOrder: [],
          persistency: undefined as any
        };
        try {
          await this.metadataStore.createBlob(createStorageContext(), dirBlob);
          // Register intermediate directory in HNS hierarchy
          const parentDir = i > 1 ? parts.slice(0, i - 1).join("/") : null;
          await this.metadataStore.registerHnsPath(
            createStorageContext(), account, filesystem,
            dirPath, parentDir, true
          );
        } catch {
          // Ignore if already exists (race condition)
        }
      }
    }
  }

  /**
   * Enforce ACL on a path operation when --oauth acl is enabled.
   * Returns true if allowed, sends error response and returns false if denied.
   */
  private async enforceAcl(
    ctx: IDfsContext,
    res: Response,
    account: string,
    filesystem: string,
    pathName: string,
    requiredPermission: AclPermission
  ): Promise<boolean> {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity) {
      return true; // ACL enforcement not active
    }

    try {
      const blobProps = await this.safeGetBlobProperties(account, filesystem, pathName);
      if (!blobProps) {
        return true; // Path doesn't exist yet (create) — allow
      }

      const owner = blobProps.metadata?.dfsAclOwner;
      const group = blobProps.metadata?.dfsAclGroup;
      const permissions = blobProps.metadata?.dfsAclPermissions;
      const acl = blobProps.metadata?.dfsAcl;

      const result = checkAcl(ctx.identity, owner, group, permissions, acl, requiredPermission);

      if (!result.allowed) {
        logger.info(
          `PathHandler ACL denied: ${result.reason} (path=${pathName}, perm=${requiredPermission})`,
          ctx.requestId
        );
        sendDfsError(res, {
          statusCode: 403,
          code: "AuthorizationPermissionMismatch",
          message: `This request is not authorized to perform this operation using this permission. Required: ${requiredPermission}`
        });
        return false;
      }

      return true;
    } catch {
      return true; // On error, allow through (best-effort enforcement)
    }
  }

  private extractLeaseConditions(req: Request): Models.LeaseAccessConditions | undefined {
    const leaseId = req.headers["x-ms-lease-id"] as string | undefined;
    if (leaseId) {
      return { leaseId };
    }
    return undefined;
  }

  private extractModifiedAccessConditions(req: Request): Models.ModifiedAccessConditions | undefined {
    const ifMatch = req.headers["if-match"] as string | undefined;
    const ifNoneMatch = req.headers["if-none-match"] as string | undefined;
    const ifModifiedSince = req.headers["if-modified-since"] as string | undefined;
    const ifUnmodifiedSince = req.headers["if-unmodified-since"] as string | undefined;

    if (!ifMatch && !ifNoneMatch && !ifModifiedSince && !ifUnmodifiedSince) {
      return undefined;
    }

    return {
      ifMatch,
      ifNoneMatch,
      ifModifiedSince: ifModifiedSince ? new Date(ifModifiedSince) : undefined,
      ifUnmodifiedSince: ifUnmodifiedSince ? new Date(ifUnmodifiedSince) : undefined
    };
  }

  private async safeGetBlobProperties(
    account: string,
    filesystem: string,
    pathName: string
  ): Promise<any | undefined> {
    try {
      return await this.metadataStore.getBlobProperties(
        createStorageContext(), account, filesystem, pathName, undefined, undefined
      );
    } catch {
      return undefined;
    }
  }
}
