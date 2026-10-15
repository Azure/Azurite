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
  DfsError,
  sendDfsError,
  pathNotFound,
  pathAlreadyExists,
  filesystemNotFound,
  directoryNotEmpty,
  internalError,
  invalidSourceOrDestination,
  invalidDestinationPath,
  pathTypeConflict,
  invalidFlushPosition,
  conditionNotMet,
  leaseIdMissing,
  requestBodyTooLarge
} from "../DfsErrorFactory";
import {
  EMULATOR_ACCOUNT_NAME,
  BLOB_API_VERSION,
  DFS_INTERNAL_METADATA_KEYS
} from "../../utils/constants";
import { newEtag } from "../../../common/utils/utils";
import { deserializeRangeHeader } from "../../utils/utils";
import * as Models from "../../generated/artifacts/models";
import { createStorageContext } from "../DfsContextFactory";
import {
  extractLeaseConditions,
  extractModifiedAccessConditions,
  extractSourceModifiedAccessConditions
} from "../DfsAccessConditions";
import {
  checkAcl,
  AclCheckResult,
  AclPermission,
  aclWithPermissions,
  applyUmask,
  isValidAcl,
  isValidUmask,
  normalizePermissions,
  permissionsFromAcl
} from "../DfsAclEnforcer";
import { parseDfsProperties } from "../DfsHeaders";
import { computeAndValidateTransactionalChecksums } from "../../utils/utils";
import { validateWriteConditions } from "../../conditions/WriteConditionalHeadersValidator";
import BlobLeaseAdapter from "../../lease/BlobLeaseAdapter";
import BlobWriteLeaseValidator from "../../lease/BlobWriteLeaseValidator";

const HNS_DIRECTORY_METADATA_KEY = "hdi_isfolder";

/**
 * Maximum size of the data of an append request: 4000 MiB, as for ADLS Gen2.
 */
const MAX_APPEND_SIZE = 4000 * 1024 * 1024;

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

    // ACL enforcement: creating an entry requires write and execute on the
    // directory that will contain it (C-5)
    if (!(await this.enforceParentAcl(ctx, res, account, filesystem, pathName, ["w", "x"]))) return;

    const leaseConditions = this.extractLeaseConditions(req);
    const modifiedConditions = this.extractModifiedAccessConditions(req);

    // Initial properties and permissions of the path
    const permissionsHeader = req.headers["x-ms-permissions"] as string | undefined;
    const umaskHeader = req.headers["x-ms-umask"] as string | undefined;
    const invalidHeader = this.validateAccessControlHeaders(permissionsHeader, undefined);
    if (invalidHeader) {
      return sendDfsError(res, invalidHeader);
    }
    if (umaskHeader !== undefined && !isValidUmask(umaskHeader)) {
      return sendDfsError(res, this.invalidHeaderValue("x-ms-umask", umaskHeader));
    }

    try {
      const now = new Date();
      const metadata: { [key: string]: string } = {};
      const properties = parseDfsProperties(req.headers["x-ms-properties"] as string | undefined);
      for (const key of Object.keys(properties)) {
        if (!DFS_INTERNAL_METADATA_KEYS.includes(key)) {
          metadata[key] = properties[key];
        }
      }
      if (isDirectory) {
        metadata[HNS_DIRECTORY_METADATA_KEY] = "true";
      }
      if (permissionsHeader !== undefined || umaskHeader !== undefined) {
        // Without x-ms-permissions, the umask applies to the default
        // permissions of a new directory (0777) or file (0666).
        const requested = permissionsHeader !== undefined
          ? normalizePermissions(permissionsHeader)!
          : isDirectory ? "rwxrwxrwx" : "rw-rw-rw-";
        metadata["dfsAclPermissions"] = umaskHeader !== undefined
          ? applyUmask(requested, umaskHeader)
          : requested;
      }

      // Azure returns 409 PathAlreadyExists when creating a directory that
      // already exists. This is required for the SDK's CreateIfNotExistsAsync
      // to correctly return null for existing directories.
      if (isDirectory) {
        const existing = await this.safeGetBlobProperties(account, filesystem, pathName, ctx.requestId);
        if (existing && existing.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true") {
          return sendDfsError(res, pathAlreadyExists(pathName));
        }
      }

      // Ensure intermediate directories exist
      if (pathName.includes("/")) {
        await this.ensureIntermediateDirectories(account, filesystem, pathName, now, ctx.requestId);
      }

      const blobModel: BlobModel = {
        accountName: account,
        containerName: filesystem,
        name: pathName,
        snapshot: "",
        isCommitted: true,
        properties: {
          lastModified: now,
          etag: newEtag(),
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

      await this.metadataStore.createBlob(
        createStorageContext(ctx.requestId), blobModel, leaseConditions, modifiedConditions
      );

      // Register in HNS hierarchy table (null = root, distinct from "" used for ACL)
      const hnsParentPath = pathName.includes("/")
        ? pathName.substring(0, pathName.lastIndexOf("/"))
        : null;
      await this.metadataStore.registerHnsPath(
        createStorageContext(ctx.requestId), account, filesystem,
        pathName, hnsParentPath, isDirectory
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
      if (error.statusCode === 409 ||
          error.code === "PathAlreadyExists" ||
          error.code === "BlobAlreadyExists" ||
          error.storageError?.storageErrorCode === "BlobAlreadyExists") {
        return sendDfsError(res, pathAlreadyExists(pathName));
      }
      if (error.statusCode === 412) {
        return sendDfsError(res, conditionNotMet());
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

    // ACL enforcement: like POSIX, deleting an entry requires write and execute
    // on the directory containing it, not permissions on the entry itself
    if (!(await this.enforceParentAcl(ctx, res, account, filesystem, pathName, ["w", "x"]))) return;

    const leaseConditions = this.extractLeaseConditions(req);
    const modifiedConditions = this.extractModifiedAccessConditions(req);

    try {
      // Check if it's a directory
      const blobProps = await this.safeGetBlobProperties(account, filesystem, pathName, ctx.requestId);
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
          // Validate the lease and conditional headers of the directory itself
          // before deleting any descendant, so a request failing them does not
          // leave the directory partially emptied.
          const validationContext = createStorageContext(ctx.requestId);
          const dirModel = await this.metadataStore.downloadBlob(
            validationContext, account, filesystem, pathName, undefined
          );
          validateWriteConditions(validationContext, modifiedConditions, dirModel);
          new BlobWriteLeaseValidator(leaseConditions).validate(
            new BlobLeaseAdapter(dirModel), validationContext
          );

          // Leased descendants are rejected rather than force-deleted, unless
          // they are leased with the lease ID of the request. Check them all
          // before deleting anything.
          const requestLeaseId = leaseConditions?.leaseId?.toLowerCase();
          const isLeased = (child: BlobModel) =>
            child.properties.leaseStatus === Models.LeaseStatusType.Locked;
          if (allChildren.some(child =>
            isLeased(child) && child.leaseId?.toLowerCase() !== requestLeaseId
          )) {
            return sendDfsError(res, leaseIdMissing());
          }

          // Delete descendant blobs with bounded concurrency. The lease ID of
          // the request only applies to the descendants holding that lease.
          const BATCH = 16;
          for (let i = 0; i < allChildren.length; i += BATCH) {
            await Promise.all(
              allChildren.slice(i, i + BATCH).map(child =>
                this.metadataStore.deleteBlob(
                  createStorageContext(ctx.requestId), account, filesystem, child.name,
                  isLeased(child) ? { leaseAccessConditions: leaseConditions } : {}
                ).catch((e: any) => { if (e.statusCode !== 404) throw e; })
              )
            );
          }
          // Unregister all descendants from HNS hierarchy
          await this.metadataStore.unregisterHnsPathsByPrefix(
            createStorageContext(ctx.requestId), account, filesystem, prefix
          );
        }
      }

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
      if (error.statusCode === 412) {
        return sendDfsError(res, { statusCode: 412, code: "ConditionNotMet", message: "The condition specified using HTTP conditional header(s) is not met." });
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
      res.setHeader("Last-Modified", new Date(result.properties.lastModified).toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-resource-type", isDir ? "directory" : "file");

      if (result.metadata) {
        const internalKeys = new Set(DFS_INTERNAL_METADATA_KEYS);
        const properties = Object.entries(result.metadata)
          .filter(([key]) => !internalKeys.has(key))
          .map(([key, value]) => `${key}=${Buffer.from(String(value)).toString("base64")}`)
          .join(",");
        if (properties) {
          res.setHeader("x-ms-properties", properties);
        }
      }

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
      if (error.statusCode === 412) {
        return sendDfsError(res, { statusCode: 412, code: "ConditionNotMet", message: "The condition specified using HTTP conditional header(s) is not met." });
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

      if (blob.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true") {
        return sendDfsError(res, { statusCode: 400, code: "PathIsDirectory",
          message: "The path is a directory, not a file." });
      }

      const totalLength = blob.properties.contentLength || 0;

      // Parse Range / x-ms-range, mirroring BlobHandler's behavior: an
      // unparsable range is ignored per RFC 9110 §14.2 rather than erroring.
      let rangeParts: [number, number] | undefined;
      try {
        rangeParts = deserializeRangeHeader(
          req.headers["range"] as string | undefined,
          req.headers["x-ms-range"] as string | undefined
        );
      } catch (err: any) {
        logger.info(`PathHandler.read: ignoring invalid range header: ${err.message}`, ctx.requestId);
      }

      let rangeStart = rangeParts ? rangeParts[0] : 0;
      let rangeEnd = rangeParts ? rangeParts[1] : Infinity;
      const isRangeRequest = rangeParts !== undefined;

      // A range must start within the content; an empty file only accepts a
      // range starting at 0, which returns the empty content.
      if (isRangeRequest && rangeStart >= totalLength && (totalLength > 0 || rangeStart > 0)) {
        return sendDfsError(res, {
          statusCode: 416,
          code: "InvalidRange",
          message: `The range specified is invalid for the current size of the resource.`
        });
      }
      if (rangeEnd + 1 >= totalLength) {
        rangeEnd = totalLength > 0 ? totalLength - 1 : 0;
      }
      if (!isRangeRequest) {
        rangeStart = 0;
        rangeEnd = totalLength > 0 ? totalLength - 1 : 0;
      }
      const contentLength = totalLength > 0 ? rangeEnd - rangeStart + 1 : 0;
      const isPartial = isRangeRequest && contentLength !== totalLength;

      res.status(isPartial ? 206 : 200);
      res.setHeader("ETag", blob.properties.etag!);
      res.setHeader("Last-Modified", new Date(blob.properties.lastModified).toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-resource-type", "file");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(contentLength));
      if (isPartial) {
        res.setHeader("Content-Range", `bytes ${rangeStart}-${rangeEnd}/${totalLength}`);
      }

      if (blob.properties.contentType) {
        res.setHeader("Content-Type", blob.properties.contentType);
      }

      const hasCommittedBlocks = blob.committedBlocksInOrder && blob.committedBlocksInOrder.length > 0;
      if (totalLength === 0) {
        res.end();
        return;
      }

      // Read from extent store, honoring the requested byte range
      if (hasCommittedBlocks) {
        const stream = await this.extentStore.readExtents(
          blob.committedBlocksInOrder!.map(b => b.persistency),
          rangeStart, contentLength, ctx.requestId
        );
        await new Promise<void>((resolve, reject) => {
          stream.on("end", () => { res.end(); resolve(); });
          stream.on("error", reject);
          stream.pipe(res, { end: false });
        });
      } else if (blob.persistency) {
        const stream = await this.extentStore.readExtent(
          {
            id: blob.persistency.id,
            offset: blob.persistency.offset + rangeStart,
            count: Math.min(blob.persistency.count, contentLength)
          },
          ctx.requestId
        );
        await new Promise<void>((resolve, reject) => {
          stream.on("end", () => { res.end(); resolve(); });
          stream.on("error", reject);
          stream.pipe(res, { end: false }); // manual end() above; avoid double-close
        });
      } else {
        res.end();
      }
    } catch (error: any) {
      if (res.headersSent) {
        // Headers already sent — can't send a DFS error; destroy the connection
        logger.error(`PathHandler.read error after headers sent: ${error.message}`, ctx.requestId);
        res.destroy(error);
        return;
      }
      if (error.statusCode === 304) {
        res.status(304);
        res.setHeader("x-ms-request-id", ctx.requestId);
        res.end();
        return;
      }
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
    const maxResults = Math.max(1, Math.min(5000, parseInt(req.query.maxResults as string, 10) || 5000));
    const continuation = req.query.continuation as string | undefined;

    // ACL enforcement: require read on the target directory (or filesystem root)
    // The filesystem root has no stored ACL: evaluate its default ACL
    const aclAllowed = directory
      ? await this.enforceAcl(ctx, res, account, filesystem, directory, "r")
      : this.enforceRootAcl(ctx, res, "r");
    if (!aclAllowed) return;

    const prefix = directory ? (directory.endsWith("/") ? directory : directory + "/") : "";
    const delimiter = recursive ? undefined : "/";

    try {
      const [blobs, prefixes, nextMarker] = await this.metadataStore.listBlobs(
        createStorageContext(ctx.requestId), account, filesystem, delimiter, undefined,
        prefix, maxResults, continuation
      );

      // If a specific directory was requested and nothing was found, return 404
      if (directory && blobs.length === 0 && (!prefixes || prefixes.length === 0) && !continuation) {
        const dirExists = await this.safeGetBlobProperties(account, filesystem, directory, ctx.requestId);
        if (!dirExists) {
          return sendDfsError(res, pathNotFound(directory));
        }
      }

      const paths: any[] = [];
      const seenNames = new Set<string>();

      for (const blob of blobs) {
        // Skip the directory marker itself if it matches prefix exactly
        if (blob.name === directory) continue;

        const isDir = blob.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true";
        paths.push({
          name: blob.name,
          isDirectory: isDir || false,
          lastModified: new Date(blob.properties.lastModified).toUTCString(),
          eTag: blob.properties.etag,
          contentLength: isDir ? 0 : (blob.properties.contentLength || 0),
          owner: blob.metadata?.dfsAclOwner || "$superuser",
          group: blob.metadata?.dfsAclGroup || "$superuser",
          permissions: blob.metadata?.dfsAclPermissions || "rwxr-x---"
        });
        seenNames.add(blob.name);
      }

      // Add prefixes as directories (for non-recursive listing).
      // Fetch all directory props in parallel to avoid an N+1 round-trip per prefix.
      // Skip any prefix whose directory name was already emitted above as a
      // directory-marker blob, to avoid duplicate entries for the same path.
      if (prefixes) {
        const newPrefixes = prefixes.filter((p) => {
          const dirName = p.name.endsWith("/") ? p.name.slice(0, -1) : p.name;
          return !seenNames.has(dirName);
        });
        const dirEntries = await Promise.all(
          newPrefixes.map(async (p) => {
            const dirName = p.name.endsWith("/") ? p.name.slice(0, -1) : p.name;
            const dirProps = await this.safeGetBlobProperties(account, filesystem, dirName, ctx.requestId);
            return {
              name: dirName,
              isDirectory: true,
              lastModified: dirProps?.properties.lastModified
                ? new Date(dirProps.properties.lastModified).toUTCString()
                : new Date().toUTCString(),
              eTag: dirProps?.properties.etag,
              contentLength: 0,
              owner: dirProps?.metadata?.dfsAclOwner || "$superuser",
              group: dirProps?.metadata?.dfsAclGroup || "$superuser",
              permissions: dirProps?.metadata?.dfsAclPermissions || "rwxr-x---"
            };
          })
        );
        paths.push(...dirEntries);
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
    const positionParam = Array.isArray(req.query.position)
      ? req.query.position[0]
      : req.query.position;
    if (positionParam !== undefined && !/^\d+$/.test(String(positionParam))) {
      return sendDfsError(res, {
        statusCode: 400,
        code: "InvalidQueryParameterValue",
        message: `Value for one of the query parameters specified in the request URI is invalid. QueryParameterName: position, QueryParameterValue: ${positionParam}`
      });
    }
    const position = parseInt(String(positionParam ?? "0"), 10);
    const leaseConditions = this.extractLeaseConditions(req);
    const modifiedConditions = this.extractModifiedAccessConditions(req);

    const contentLengthHeader = req.headers["content-length"];
    const contentLength = contentLengthHeader !== undefined ? Number(contentLengthHeader) : undefined;
    if (contentLength !== undefined && contentLength > MAX_APPEND_SIZE) {
      return sendDfsError(res, requestBodyTooLarge());
    }

    try {
      // Validate position matches the current expected next offset (contiguity enforcement).
      // NOTE: this check is not atomic with stageBlock — two concurrent appends at the same
      // position will both pass and the second will silently overwrite the first block (the
      // first extent is then orphaned). This is a known limitation of the emulator.
      const blobProps = await this.metadataStore.getBlobProperties(
        createStorageContext(ctx.requestId), account, filesystem, pathName, undefined, leaseConditions
      );
      // Appending is a write: validate the conditional headers like the Blob API
      validateWriteConditions(
        createStorageContext(ctx.requestId), modifiedConditions, blobProps as BlobModel
      );
      const blockList = await this.metadataStore.getBlockList(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        undefined, undefined, undefined, undefined
      );
      const committedLength = blobProps.properties.contentLength ?? 0;
      const uncommittedLength = (blockList.uncommittedBlocks ?? []).reduce((sum, b) => sum + (b.size ?? 0), 0);
      const expectedPosition = committedLength + uncommittedLength;
      if (position !== expectedPosition) {
        return sendDfsError(res, {
          statusCode: 409,
          code: "ConditionNotMet",
          message: `Append position ${position} does not match the expected offset ${expectedPosition}.`
        });
      }

      if (contentLength === 0) {
        res.status(202);
        res.setHeader("x-ms-request-id", ctx.requestId);
        res.setHeader("x-ms-version", BLOB_API_VERSION);
        res.end();
        return;
      }

      // Stream the request body into the extent store instead of buffering it
      const extentChunk = await this.extentStore.appendExtent(req, ctx.requestId);
      if (contentLength !== undefined && extentChunk.count !== contentLength) {
        return sendDfsError(res, {
          statusCode: 400,
          code: "InvalidInput",
          message: `The size of the request body ${extentChunk.count} mismatches the content-length ${contentLength}.`
        });
      }
      if (extentChunk.count > MAX_APPEND_SIZE) {
        return sendDfsError(res, requestBodyTooLarge());
      }
      if (extentChunk.count === 0) {
        res.status(202);
        res.setHeader("x-ms-request-id", ctx.requestId);
        res.setHeader("x-ms-version", BLOB_API_VERSION);
        res.end();
        return;
      }

      // Content-MD5 validation, reading the stored data back like the Blob API
      const contentMD5 = req.headers["content-md5"] as string | undefined;
      if (contentMD5) {
        await computeAndValidateTransactionalChecksums(
          await this.extentStore.readExtent(extentChunk, ctx.requestId),
          { md5: contentMD5 },
          ctx.requestId
        );
      }

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
        size: extentChunk.count,
        persistency: extentChunk
      };

      await this.metadataStore.stageBlock(
        createStorageContext(ctx.requestId), block, leaseConditions
      );

      res.status(202);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.setHeader("x-ms-content-length", String(extentChunk.count));
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      if (error.statusCode === 412) {
        return sendDfsError(res, conditionNotMet());
      }
      if (error.statusCode === 400 && error.storageErrorCode) {
        // e.g. Md5Mismatch or InvalidMd5
        return sendDfsError(res, {
          statusCode: 400,
          code: error.storageErrorCode,
          message: error.storageErrorMessage || error.message
        });
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
    const flushPositionParam = Array.isArray(req.query.position)
      ? req.query.position[0]
      : req.query.position;
    if (flushPositionParam !== undefined && !/^\d+$/.test(String(flushPositionParam))) {
      return sendDfsError(res, {
        statusCode: 400,
        code: "InvalidQueryParameterValue",
        message: `Value for one of the query parameters specified in the request URI is invalid. QueryParameterName: position, QueryParameterValue: ${flushPositionParam}`
      });
    }
    const position = parseInt(String(flushPositionParam ?? "0"), 10);
    const leaseConditions = this.extractLeaseConditions(req);
    const modifiedConditions = this.extractModifiedAccessConditions(req);

    try {
      // Get current blob to find uncommitted blocks
      const blob = await this.metadataStore.downloadBlob(
        createStorageContext(ctx.requestId), account, filesystem, pathName, undefined
      );
      // Flushing is a write: validate the conditional headers like the Blob
      // API, including for a flush with nothing to commit. commitBlockList
      // validates them again when it commits.
      validateWriteConditions(createStorageContext(ctx.requestId), modifiedConditions, blob);

      // Get uncommitted blocks
      const blockList = await this.metadataStore.getBlockList(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        undefined, undefined, undefined, undefined
      );

      if (!blockList.uncommittedBlocks || blockList.uncommittedBlocks.length === 0) {
        // Nothing to flush — still enforce the position contract against the
        // blob's current committed length (a flush is a no-op only when the
        // caller's view of the length actually matches reality).
        const committedLength = blob.properties.contentLength ?? 0;
        if (position !== committedLength) {
          return sendDfsError(res, invalidFlushPosition(position, committedLength));
        }
        res.status(200);
        res.setHeader("ETag", blob.properties.etag!);
        res.setHeader("Last-Modified", new Date(blob.properties.lastModified).toUTCString());
        res.setHeader("x-ms-request-id", ctx.requestId);
        res.setHeader("x-ms-version", BLOB_API_VERSION);
        res.end();
        return;
      }

      // Sort blocks by the byte offset encoded in the block ID ("dfs-<position>")
      const sortedBlocks = [...blockList.uncommittedBlocks].sort((a, b) => {
        const decode = (name: string) => {
          const raw = Buffer.from(name, "base64").toString("utf8");
          return raw.startsWith("dfs-") ? parseInt(raw.substring(4), 10) : 0;
        };
        return decode(a.name) - decode(b.name);
      });

      // Validate position matches the actual data length (committed + staged)
      const committedLength = blob.properties.contentLength ?? 0;
      const stagedLength = sortedBlocks.reduce((sum, b) => sum + (b.size ?? 0), 0);
      const impliedLength = committedLength + stagedLength;
      if (position !== impliedLength) {
        return sendDfsError(res, invalidFlushPosition(position, impliedLength));
      }

      // Include previously committed blocks so multi-cycle append→flush is correct
      const previouslyCommitted = (blob.committedBlocksInOrder || []).map(b => ({
        blockName: b.name,
        blockCommitType: "Committed"
      }));
      const commitList = [
        ...previouslyCommitted,
        ...sortedBlocks.map(b => ({ blockName: b.name, blockCommitType: "Uncommitted" }))
      ];

      const now = new Date();
      const etag = newEtag();

      const updatedBlob: BlobModel = {
        ...blob,
        properties: {
          ...blob.properties,
          lastModified: now,
          etag,
          contentLength: impliedLength,
          contentType: blob.properties.contentType || "application/octet-stream"
        }
      };

      await this.metadataStore.commitBlockList(
        createStorageContext(ctx.requestId), updatedBlob, commitList, leaseConditions, modifiedConditions
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
      if (error.statusCode === 412) {
        return sendDfsError(res, conditionNotMet());
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

      const invalidHeader = this.validateAccessControlHeaders(permissions, acl);
      if (invalidHeader) {
        return sendDfsError(res, invalidHeader);
      }

      // Like real ADLS Gen2, only the owning user or $superuser may change the
      // owner, group, permissions or ACL of a path. A caller who merely has
      // write access to the path (the only check enforced above via update()'s
      // enforceAcl) must not be able to grant themselves more access.
      if ((owner || group || permissions || acl) && !this.isOwnerOrSuperuser(ctx, metadata)) {
        return sendDfsError(res, {
          statusCode: 403,
          code: "AuthorizationPermissionMismatch",
          message: "This request is not authorized to change the access control of this path. Only the current owner or $superuser may do so."
        });
      }

      if (owner) metadata["dfsAclOwner"] = owner;
      if (group) metadata["dfsAclGroup"] = group;
      // Keep the permission string and the base entries (user::, group::,
      // other::) of the ACL synchronized, as both describe the same
      // permissions and the ACL entries win when evaluating access.
      if (acl) {
        metadata["dfsAcl"] = acl;
        metadata["dfsAclPermissions"] = permissions
          ? normalizePermissions(permissions)!
          : permissionsFromAcl(acl, metadata["dfsAclPermissions"]);
      } else if (permissions) {
        metadata["dfsAclPermissions"] = normalizePermissions(permissions)!;
        if (metadata["dfsAcl"]) {
          metadata["dfsAcl"] = aclWithPermissions(metadata["dfsAcl"], metadata["dfsAclPermissions"]);
        }
      }

      const updatedProperties = await this.metadataStore.setBlobMetadata(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        this.extractLeaseConditions(req), metadata, this.extractModifiedAccessConditions(req)
      );

      res.status(200);
      res.setHeader("ETag", updatedProperties.etag!);
      res.setHeader("Last-Modified", updatedProperties.lastModified.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      if (error.statusCode === 412) {
        return sendDfsError(res, conditionNotMet());
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
    const maxRecords = Math.max(1, Math.min(2000, parseInt(req.query.maxRecords as string, 10) || 2000));
    const continuation = req.query.continuation as string | undefined;

    if (mode !== "set" && mode !== "modify" && mode !== "remove") {
      return sendDfsError(res, { statusCode: 400, code: "InvalidQueryParameterValue",
        message: `Invalid value for query parameter 'mode': ${mode}. Must be 'set', 'modify', or 'remove'.` });
    }
    if (acl !== undefined && !isValidAcl(acl, mode !== "remove")) {
      return sendDfsError(res, this.invalidHeaderValue("x-ms-acl", acl));
    }

    try {
      const prefix = pathName.endsWith("/") ? pathName : pathName + "/";

      const [blobs, , nextMarker] = await this.metadataStore.listBlobs(
        createStorageContext(ctx.requestId), account, filesystem,
        undefined, undefined, prefix, maxRecords, continuation
      );

      let directoriesSuccessful = 0;
      let filesSuccessful = 0;
      let failureCount = 0;

      // Include root only on first page; subsequent pages should not re-process it
      const allPaths = continuation
        ? blobs.map(b => b.name)
        : [pathName, ...blobs.map(b => b.name)];

      for (const blobPath of allPaths) {
        try {
          const props = await this.metadataStore.getBlobProperties(
            createStorageContext(ctx.requestId), account, filesystem,
            blobPath, undefined, undefined
          );

          const metadata = { ...(props.metadata || {}) };

          // Recursive ACL changes must be authorized per-node, not just at the
          // root: like a single setAccessControl, only the owning user or
          // $superuser of each path may change its ACL. A denied path is
          // counted as a per-item failure instead of aborting the whole
          // recursive operation.
          if (!this.isOwnerOrSuperuser(ctx, metadata)) {
            logger.info(
              `PathHandler ACL denied (recursive): caller is not the owner (path=${blobPath})`,
              ctx.requestId
            );
            failureCount++;
            continue;
          }
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

          if (acl) {
            metadata["dfsAclPermissions"] = permissionsFromAcl(metadata["dfsAcl"], metadata["dfsAclPermissions"]);
          }

          // The lease ID of the request applies to the leased paths, as an
          // unleased path rejects a lease ID, and the conditional headers to
          // the path named by the request.
          const isLeased = props.properties.leaseStatus === Models.LeaseStatusType.Locked;
          await this.metadataStore.setBlobMetadata(
            createStorageContext(ctx.requestId), account, filesystem,
            blobPath, isLeased ? this.extractLeaseConditions(req) : undefined, metadata,
            blobPath === pathName ? this.extractModifiedAccessConditions(req) : undefined
          );

          if (isDir) {
            directoriesSuccessful++;
          } else {
            filesSuccessful++;
          }
        } catch {
          failureCount++;
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

      // Parse x-ms-properties header (base64 encoded key=value pairs); block reserved keys
      const reservedKeys = new Set(DFS_INTERNAL_METADATA_KEYS);
      const propertiesHeader = req.headers["x-ms-properties"] as string | undefined;
      if (propertiesHeader) {
        const pairs = propertiesHeader.split(",");
        for (const pair of pairs) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx >= 0) {
            const key = pair.substring(0, eqIdx);
            if (!reservedKeys.has(key)) {
              const value = Buffer.from(pair.substring(eqIdx + 1), "base64").toString("utf8");
              metadata[key] = value;
            }
          }
        }
      }

      const updatedProperties = await this.metadataStore.setBlobMetadata(
        createStorageContext(ctx.requestId), account, filesystem, pathName,
        this.extractLeaseConditions(req), metadata, this.extractModifiedAccessConditions(req)
      );

      res.status(200);
      res.setHeader("ETag", updatedProperties.etag!);
      res.setHeader("Last-Modified", updatedProperties.lastModified.toUTCString());
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      res.end();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      if (error.statusCode === 412) {
        return sendDfsError(res, conditionNotMet());
      }
      logger.error(`PathHandler.setProperties error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async lease(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;
    if (!(await this.enforceAcl(ctx, res, account, filesystem, pathName, "w"))) return;

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
      const durationHeader = req.headers["x-ms-lease-duration"] as string | undefined;
      const duration = durationHeader === undefined ? -1 : Number(durationHeader);
      // A lease is infinite (-1) or lasts 15 to 60 seconds
      if (!/^-?\d+$/.test(durationHeader ?? "-1") || (duration !== -1 && (duration < 15 || duration > 60))) {
        return sendDfsError(res, this.invalidHeaderValue("x-ms-lease-duration", durationHeader!));
      }
      const proposedLeaseId = req.headers["x-ms-proposed-lease-id"] as string | undefined;
      const modifiedConditions = this.extractModifiedAccessConditions(req);

      const result = await this.metadataStore.acquireBlobLease(
        createStorageContext(ctx.requestId),
        account, filesystem, pathName, duration, proposedLeaseId,
        { modifiedAccessConditions: modifiedConditions }
      );

      res.status(201);
      res.setHeader("ETag", result.properties.etag!);
      res.setHeader("Last-Modified", new Date(result.properties.lastModified).toUTCString());
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
      res.setHeader("Last-Modified", new Date(result.properties.lastModified).toUTCString());
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
      const rawBreakPeriod = req.headers["x-ms-lease-break-period"] as string | undefined;
      const breakPeriod = rawBreakPeriod !== undefined ? Number(rawBreakPeriod) : undefined;
      // A break period is an integer from 0 to 60 seconds
      if (breakPeriod !== undefined && (!/^\d+$/.test(rawBreakPeriod!) || breakPeriod > 60)) {
        return sendDfsError(res, { statusCode: 400, code: "InvalidHeaderValue",
          message: "x-ms-lease-break-period must be a non-negative integer." });
      }
      const modifiedConditions = this.extractModifiedAccessConditions(req);

      const result = await this.metadataStore.breakBlobLease(
        createStorageContext(ctx.requestId),
        account, filesystem, pathName, breakPeriod,
        { modifiedAccessConditions: modifiedConditions }
      );

      res.status(202);
      res.setHeader("ETag", result.properties.etag!);
      res.setHeader("Last-Modified", new Date(result.properties.lastModified).toUTCString());
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
      res.setHeader("Last-Modified", new Date(result.properties.lastModified).toUTCString());
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
    // The DataLake REST API uses x-ms-source-lease-id to authorize renaming a
    // leased source path, and the regular x-ms-lease-id / conditional headers
    // apply to the destination path (matching Blob Rename/Copy semantics).
    const sourceLeaseId = req.headers["x-ms-source-lease-id"] as string | undefined;
    const sourceLeaseConditions = sourceLeaseId ? { leaseId: sourceLeaseId } : undefined;
    const sourceModifiedConditions = extractSourceModifiedAccessConditions(req);
    const destLeaseConditions = this.extractLeaseConditions(req);
    const destModifiedConditions = this.extractModifiedAccessConditions(req);

    let sourceFilesystem: string | undefined;
    let sourcePath: string | undefined;

    try {
      // Parse rename source: /{filesystem}/{path}?sastoken
      const sourceUrl = new URL(renameSource, "http://localhost");
      const sourceParts = sourceUrl.pathname.split("/").filter(p => p).map(decodeURIComponent);
      if (sourceParts.some(p => p === "..")) {
        return sendDfsError(res, invalidSourceOrDestination("Rename source path must not contain '..' segments."));
      }

      // Handle both /{account}/{filesystem}/{path} and /{filesystem}/{path}
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

      // Get source blob to check if it exists and whether it's a directory.
      // Also validates x-ms-source-lease-id against any active lease on the source.
      let sourceBlob;
      try {
        sourceBlob = await this.metadataStore.getBlobProperties(
          createStorageContext(ctx.requestId), account, sourceFilesystem, sourcePath!,
          undefined, sourceLeaseConditions
        );
      } catch (err: any) {
        if (err.statusCode === 404) {
          return sendDfsError(res, pathNotFound(sourcePath));
        }
        if (err.statusCode === 412) {
          return sendDfsError(res, conditionNotMet());
        }
        throw err;
      }

      // ACL enforcement: like POSIX, moving an entry requires write and execute
      // on the directories containing the source and the destination.
      // Overwriting an existing destination also requires write on it.
      if (!(await this.enforceParentAcl(ctx, res, account, sourceFilesystem, sourcePath!, ["w", "x"]))) return;
      if (!(await this.enforceParentAcl(ctx, res, account, destFilesystem, destPath, ["w", "x"]))) return;
      if (!(await this.enforceAcl(ctx, res, account, destFilesystem, destPath, "w"))) return;

      const isDir = sourceBlob.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true";

      if (sourceFilesystem === destFilesystem) {
        // Renaming a path onto itself is a no-op, as with POSIX rename().
        if (sourcePath === destPath) {
          res.status(201);
          res.setHeader("ETag", sourceBlob.properties.etag!);
          res.setHeader("Last-Modified", new Date(sourceBlob.properties.lastModified).toUTCString());
          res.setHeader("x-ms-request-id", ctx.requestId);
          res.setHeader("x-ms-version", BLOB_API_VERSION);
          res.setHeader("Content-Length", "0");
          res.end();
          return;
        }

        // A directory cannot be moved into its own subtree.
        if (destPath.startsWith(sourcePath + "/")) {
          return sendDfsError(res, invalidDestinationPath(
            `Cannot rename "${sourcePath}" to "${destPath}", a path inside itself.`
          ));
        }
      }

      // Azure overwrite semantics: if destination exists, overwrite files and empty
      // directories; reject rename onto a non-empty directory (M-1). The store
      // re-validates these rules when it replaces the destination atomically.
      const destBlob = await this.safeGetBlobProperties(account, destFilesystem, destPath, ctx.requestId);
      const now = new Date();
      if (destBlob) {
        const destIsDir = destBlob.metadata?.[HNS_DIRECTORY_METADATA_KEY] === "true";
        // A rename must not silently replace a file with a directory or vice versa —
        // real ADLS Gen2 rejects this type mismatch rather than deleting the destination.
        if (destIsDir !== isDir) {
          return sendDfsError(res, pathTypeConflict(isDir, sourcePath!, destIsDir, destPath));
        }
        if (destIsDir) {
          // Check if the destination directory is empty
          const destPrefix = destPath + "/";
          const [destChildren] = await this.metadataStore.listBlobs(
            createStorageContext(ctx.requestId), account, destFilesystem, undefined, undefined, destPrefix, 1
          );
          if (destChildren.length > 0) {
            return sendDfsError(res, directoryNotEmpty(destPath));
          }
        }
      } else if (destPath.includes("/")) {
        // No existing destination blob — intermediate directories may need to
        // be created. Do this before the atomic rename so the hierarchy is
        // consistent; there is nothing destructive to roll back if this fails.
        await this.ensureIntermediateDirectories(account, destFilesystem, destPath, now, ctx.requestId);
      }

      // The destination (when it exists) is validated against the lease and
      // conditional headers and removed in the same atomic operation as the
      // rename, so a failing or concurrent request cannot lose it.
      let result: Models.BlobPropertiesInternal;
      try {
        result = await this.metadataStore.renamePathAtomic(
          createStorageContext(ctx.requestId),
          account,
          sourceFilesystem,
          sourcePath,
          destFilesystem,
          destPath,
          isDir,
          {
            leaseAccessConditions: destLeaseConditions,
            modifiedAccessConditions: destModifiedConditions
          },
          {
            leaseAccessConditions: sourceLeaseConditions,
            modifiedAccessConditions: sourceModifiedConditions
          }
        );
      } catch (err: any) {
        if (err.statusCode === 412) {
          // e.g. ConditionNotMet, or LeaseIdMissing for a leased source
          // renamed without x-ms-source-lease-id
          return sendDfsError(res, {
            statusCode: 412,
            code: err.storageErrorCode || "ConditionNotMet",
            message: err.storageErrorMessage || "The condition specified using HTTP conditional header(s) is not met."
          });
        }
        if (err.statusCode === 409 && err.storageErrorCode === "DirectoryNotEmpty") {
          return sendDfsError(res, directoryNotEmpty(destPath));
        }
        if (err.statusCode === 409 && err.storageErrorCode === "PathConflict") {
          return sendDfsError(res, pathTypeConflict(isDir, sourcePath!, !isDir, destPath));
        }
        throw err;
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
        return sendDfsError(res, pathNotFound(sourcePath ?? destPath));
      }
      logger.error(`PathHandler.renamePath error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  private async ensureIntermediateDirectories(
    account: string,
    filesystem: string,
    pathName: string,
    now: Date,
    requestId: string
  ): Promise<void> {
    const parts = pathName.split("/");
    // Skip the last part (the file/dir being created)
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/");
      const existing = await this.safeGetBlobProperties(account, filesystem, dirPath, requestId);
      if (existing && existing.metadata?.[HNS_DIRECTORY_METADATA_KEY] !== "true") {
        // A file exists at this path — cannot use it as a parent directory
        throw Object.assign(new Error(`PathConflict: "${dirPath}" is a file, not a directory`), { statusCode: 409, code: "PathAlreadyExists" });
      }
      if (!existing) {
        const dirBlob: BlobModel = {
          accountName: account,
          containerName: filesystem,
          name: dirPath,
          snapshot: "",
          isCommitted: true,
          properties: {
            lastModified: now,
            etag: newEtag(),
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
          await this.metadataStore.createBlob(createStorageContext(requestId), dirBlob);
          // Register intermediate directory in HNS hierarchy
          const parentDir = i > 1 ? parts.slice(0, i - 1).join("/") : null;
          await this.metadataStore.registerHnsPath(
            createStorageContext(requestId), account, filesystem,
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
   * A path that doesn't exist yet is not checked; operations creating it are
   * authorized against its parent directory with enforceParentAcl().
   *
   * NOTE (accepted emulator limitation): this check and the mutating operation
   * that follows it are two separate round-trips (TOCTOU) — a path can be
   * deleted/renamed/re-ACL'd by a concurrent request between the check and the
   * actual operation. This is the same class of limitation as the documented
   * append-position race in appendData(); low real-world severity for a
   * single-process emulator but worth keeping in mind if this code is ever
   * adapted for a multi-process/concurrent deployment.
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
      const blobProps = await this.safeGetBlobProperties(account, filesystem, pathName, ctx.requestId);
      if (!blobProps) {
        return true; // Path doesn't exist yet — authorized against its parent
      }

      const traversal = await this.checkTraversal(
        ctx, account, filesystem, this.getAncestors(pathName)
      );
      if (!traversal.result.allowed) {
        return this.sendAclResult(ctx, res, traversal.path, ["x"], traversal.result);
      }

      return this.sendAclResult(
        ctx, res, pathName, [requiredPermission],
        this.evaluateAcl(ctx, blobProps.metadata, [requiredPermission])
      );
    } catch (error: any) {
      logger.error(`PathHandler.enforceAcl error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError("ACL evaluation failed."));
      return false;
    }
  }

  /**
   * Enforce ACL on the directory containing a path when --oauth acl is enabled,
   * as creating, deleting and renaming an entry is authorized by its parent
   * directory. Missing intermediate directories are created on demand, so the
   * nearest existing ancestor is evaluated instead. The filesystem root has no
   * stored ACL and is evaluated with the default ACL of ADLS Gen2: owned by
   * $superuser with rwxr-x--- permissions. Execute permission is also required
   * on the existing ancestors of that directory, except the root.
   * Returns true if allowed, sends error response and returns false if denied.
   */
  private async enforceParentAcl(
    ctx: IDfsContext,
    res: Response,
    account: string,
    filesystem: string,
    pathName: string,
    requiredPermissions: AclPermission[]
  ): Promise<boolean> {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity) {
      return true; // ACL enforcement not active
    }

    try {
      const ancestors = this.getAncestors(pathName);
      let directory = "";
      let directoryProps: any | undefined;
      let index = 0;
      for (; index < ancestors.length; index++) {
        directoryProps = await this.safeGetBlobProperties(account, filesystem, ancestors[index], ctx.requestId);
        if (directoryProps) {
          directory = ancestors[index];
          break;
        }
      }

      // Like POSIX, reaching the directory requires execute on its ancestors
      const traversal = await this.checkTraversal(
        ctx, account, filesystem, ancestors.slice(index + 1)
      );
      if (!traversal.result.allowed) {
        return this.sendAclResult(ctx, res, traversal.path, ["x"], traversal.result);
      }

      return this.sendAclResult(
        ctx, res, directory || "/", requiredPermissions,
        this.evaluateAcl(ctx, directoryProps?.metadata, requiredPermissions)
      );
    } catch (error: any) {
      logger.error(`PathHandler.enforceParentAcl error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError("ACL evaluation failed."));
      return false;
    }
  }

  /**
   * Enforce ACL on the filesystem root when --oauth acl is enabled. The root
   * has no stored ACL and is evaluated with the default ACL of ADLS Gen2:
   * owned by $superuser with rwxr-x--- permissions.
   * Returns true if allowed, sends error response and returns false if denied.
   */
  private enforceRootAcl(
    ctx: IDfsContext,
    res: Response,
    requiredPermission: AclPermission
  ): boolean {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity) {
      return true; // ACL enforcement not active
    }
    return this.sendAclResult(
      ctx, res, "/", [requiredPermission],
      this.evaluateAcl(ctx, undefined, [requiredPermission])
    );
  }

  /**
   * Whether the caller may change the access control of a path: always when ACL
   * enforcement is inactive, otherwise only the owning user or $superuser.
   */
  private isOwnerOrSuperuser(
    ctx: IDfsContext,
    metadata: { [key: string]: string } | undefined
  ): boolean {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity) {
      return true; // ACL enforcement not active
    }
    const callerId = ctx.identity.oid || ctx.identity.upn || "";
    const currentOwner = metadata?.dfsAclOwner || "$superuser";
    return callerId === "$superuser" || callerId === currentOwner;
  }

  /**
   * Validate the syntax of the x-ms-permissions and x-ms-acl headers.
   * Returns the error to send, or undefined when both are valid or absent.
   */
  private validateAccessControlHeaders(
    permissions: string | undefined,
    acl: string | undefined
  ): DfsError | undefined {
    if (permissions !== undefined && normalizePermissions(permissions) === undefined) {
      return this.invalidHeaderValue("x-ms-permissions", permissions);
    }
    if (acl !== undefined && !isValidAcl(acl)) {
      return this.invalidHeaderValue("x-ms-acl", acl);
    }
    return undefined;
  }

  private invalidHeaderValue(header: string, value: string): DfsError {
    return {
      statusCode: 400,
      code: "InvalidHeaderValue",
      message: `The value for one of the HTTP headers is not in the correct format. Header: ${header}, Value: ${value}`
    };
  }

  /**
   * Evaluate the ACL stored in the metadata of a path, or the default ACL when
   * the metadata is undefined, for every required permission.
   */
  private evaluateAcl(
    ctx: IDfsContext,
    metadata: { [key: string]: string } | undefined,
    requiredPermissions: AclPermission[]
  ): AclCheckResult {
    let result: AclCheckResult = { allowed: true, reason: "No permission required" };
    for (const permission of requiredPermissions) {
      result = checkAcl(
        ctx.identity,
        metadata?.dfsAclOwner,
        metadata?.dfsAclGroup,
        metadata?.dfsAclPermissions,
        metadata?.dfsAcl,
        permission
      );
      if (!result.allowed) {
        break;
      }
    }
    return result;
  }

  private sendAclResult(
    ctx: IDfsContext,
    res: Response,
    pathName: string,
    requiredPermissions: AclPermission[],
    result: AclCheckResult
  ): boolean {
    if (result.allowed) {
      return true;
    }

    const required = requiredPermissions.join("");
    logger.info(
      `PathHandler ACL denied: ${result.reason} (path=${pathName}, perm=${required})`,
      ctx.requestId
    );
    sendDfsError(res, {
      statusCode: 403,
      code: "AuthorizationPermissionMismatch",
      message: `This request is not authorized to perform this operation using this permission. Required: ${required}`
    });
    return false;
  }

  /**
   * Check execute (traversal) permission on directories, as POSIX and ADLS
   * Gen2 require it on every ancestor of a path. Missing directories are
   * skipped. The filesystem root is not checked: the emulator can't set its
   * ACL, so its default ACL would deny every caller other than $superuser.
   */
  private async checkTraversal(
    ctx: IDfsContext,
    account: string,
    filesystem: string,
    directories: string[]
  ): Promise<{ path: string; result: AclCheckResult }> {
    for (const directory of directories) {
      const props = await this.safeGetBlobProperties(account, filesystem, directory, ctx.requestId);
      if (props) {
        const result = this.evaluateAcl(ctx, props.metadata, ["x"]);
        if (!result.allowed) {
          return { path: directory, result };
        }
      }
    }
    return { path: "", result: { allowed: true, reason: "Traversal granted" } };
  }

  /**
   * The ancestor directories of a path, nearest first, without the
   * filesystem root.
   */
  private getAncestors(pathName: string): string[] {
    const ancestors: string[] = [];
    for (let directory = this.getParentPath(pathName); directory !== ""; directory = this.getParentPath(directory)) {
      ancestors.push(directory);
    }
    return ancestors;
  }

  private getParentPath(pathName: string): string {
    return pathName.includes("/")
      ? pathName.substring(0, pathName.lastIndexOf("/"))
      : "";
  }

  private extractLeaseConditions(req: Request): Models.LeaseAccessConditions | undefined {
    return extractLeaseConditions(req);
  }

  private extractModifiedAccessConditions(req: Request): Models.ModifiedAccessConditions | undefined {
    return extractModifiedAccessConditions(req);
  }

  private async safeGetBlobProperties(
    account: string,
    filesystem: string,
    pathName: string,
    requestId: string
  ): Promise<any | undefined> {
    try {
      return await this.metadataStore.getBlobProperties(
        createStorageContext(requestId), account, filesystem, pathName, undefined, undefined
      );
    } catch (error: any) {
      if (error.statusCode === 404) return undefined;
      throw error; // rethrow real errors — do not mask as "not found"
    }
  }
}
