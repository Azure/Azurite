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
  normalizeAcl,
  normalizePermissions,
  permissionsFromAcl
} from "../DfsAclEnforcer";
import {
  isPathStyleRequest,
  parseDfsProperties,
  parseRenameSource
} from "../DfsHeaders";
import { computeAndValidateTransactionalChecksums, isDfsDirectoryMetadata } from "../../utils/utils";
import { validateWriteConditions } from "../../conditions/WriteConditionalHeadersValidator";
import BlobLeaseAdapter from "../../lease/BlobLeaseAdapter";
import BlobWriteLeaseValidator from "../../lease/BlobWriteLeaseValidator";

const HNS_DIRECTORY_METADATA_KEY = "hdi_isfolder";

/**
 * Maximum size of the data of an append request: 4000 MiB, as for ADLS Gen2.
 */
const MAX_APPEND_SIZE = 4000 * 1024 * 1024;

/**
 * Default umask applied to the permissions of new paths, as for ADLS Gen2.
 */
const DEFAULT_UMASK = "0027";

/**
 * The scope, type and entity of an ACL entry, which identify it in a merge or
 * removal: "default:user:bob:rwx" -> "default:user:bob", "group::r-x" ->
 * "group:", and the same for the entries of a removal, which have no
 * permissions ("default:user:bob", "group::").
 */
function aclEntryKey(entry: string): string {
  const parts = entry.trim().split(":");
  const last = parts[parts.length - 1];
  const scopeLength = parts[0] === "default" ? 3 : 2;
  return parts.length > scopeLength && (last === "" || /^[r-][w-][x-]$/.test(last))
    ? parts.slice(0, -1).join(":")
    : parts.join(":");
}

const DFS_INTERNAL_METADATA_KEYS_LOWER_CASE = new Set(
  DFS_INTERNAL_METADATA_KEYS.map(key => key.toLowerCase())
);

export default class PathHandler {
  /**
   * The tail of the queue of append and flush operations of each path. They
   * run one at a time per path, so that the position checks and the writes of
   * concurrent appends at the same position can't interleave: the second one
   * fails its position check instead of replacing the first one's data. The
   * emulator serves a path from a single process.
   */
  private readonly pathLocks = new Map<string, Promise<void>>();

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
    const ownerHeader = req.headers["x-ms-owner"] as string | undefined;
    const groupHeader = req.headers["x-ms-group"] as string | undefined;
    const aclHeader = req.headers["x-ms-acl"] as string | undefined;
    const invalidHeader = this.validateAccessControlHeaders(permissionsHeader, aclHeader);
    if (invalidHeader) {
      return sendDfsError(res, invalidHeader);
    }
    if (umaskHeader !== undefined && !isValidUmask(umaskHeader)) {
      return sendDfsError(res, this.invalidHeaderValue("x-ms-umask", umaskHeader));
    }
    // Like changing the owner of an existing path, giving a new path another
    // owner than the caller is reserved to $superuser
    if (ownerHeader !== undefined && !this.isOwnerOrSuperuser(ctx, { dfsAclOwner: ownerHeader })) {
      return sendDfsError(res, {
        statusCode: 403,
        code: "AuthorizationPermissionMismatch",
        message: "This request is not authorized to set the owner of a path to another identity. Only $superuser may do so."
      });
    }

    try {
      const now = new Date();
      const ownerId = this.callerOwnerId(ctx);

      // Ensure intermediate directories exist, and get the metadata of the
      // directory that will contain the path
      const parentMetadata = pathName.includes("/")
        ? await this.ensureIntermediateDirectories(account, filesystem, pathName, now, ctx.requestId, ownerId)
        : undefined;

      const metadata: { [key: string]: string } = {
        ...this.inheritedAccessControl(parentMetadata, isDirectory, ownerId)
      };
      Object.assign(metadata, this.userProperties(req.headers["x-ms-properties"] as string | undefined));
      if (isDirectory) {
        metadata[HNS_DIRECTORY_METADATA_KEY] = "true";
      }
      if (metadata["dfsAcl"] === undefined) {
        // Like ADLS Gen2, without a default ACL inherited from the parent, the
        // umask (0027 by default) applies to the requested permissions, or to
        // the default permissions of a new directory (0777) or file (0666).
        const requested = permissionsHeader !== undefined
          ? normalizePermissions(permissionsHeader)!
          : isDirectory ? "rwxrwxrwx" : "rw-rw-rw-";
        metadata["dfsAclPermissions"] = applyUmask(requested, umaskHeader ?? DEFAULT_UMASK);
      } else if (permissionsHeader !== undefined) {
        // An inherited default ACL replaces the umask
        metadata["dfsAclPermissions"] = normalizePermissions(permissionsHeader)!;
        metadata["dfsAcl"] = aclWithPermissions(metadata["dfsAcl"], metadata["dfsAclPermissions"]);
      }
      // The access control requested explicitly
      if (aclHeader !== undefined) {
        metadata["dfsAcl"] = normalizeAcl(aclHeader);
        metadata["dfsAclPermissions"] = permissionsFromAcl(metadata["dfsAcl"], metadata["dfsAclPermissions"]);
      }
      if (ownerHeader !== undefined) {
        metadata["dfsAclOwner"] = ownerHeader;
      }
      if (groupHeader !== undefined) {
        metadata["dfsAclGroup"] = groupHeader;
      }

      // Like Azure, creating an existing path replaces it, unless the request
      // has If-None-Match: * (e.g. the SDKs' createIfNotExists), which fails
      // with 409 PathAlreadyExists from createBlob
      const existing = await this.safeGetBlobProperties(account, filesystem, pathName, ctx.requestId);
      if (existing) {
        const existingIsDirectory = isDfsDirectoryMetadata(existing.metadata);
        // A file can't replace a directory, nor a directory a file
        if (isDirectory !== existingIsDirectory && modifiedConditions?.ifNoneMatch !== "*") {
          return sendDfsError(res, {
            statusCode: 409,
            code: "PathConflict",
            message: `Cannot create ${isDirectory ? "directory" : "file"} "${pathName}" over an existing ${existingIsDirectory ? "directory" : "file"}.`
          });
        }
        // Replacing a path also requires write permission on it
        if (!(await this.enforceAcl(ctx, res, account, filesystem, pathName, "w"))) return;
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
          ...this.contentProperties(req),
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

      // Register in HNS hierarchy table (null = root, distinct from "" used
      // for ACL) before creating the blob, and remove the entry if the blob
      // can't be created, so that a failure never leaves a blob without it
      const hnsParentPath = pathName.includes("/")
        ? pathName.substring(0, pathName.lastIndexOf("/"))
        : null;
      await this.metadataStore.registerHnsPath(
        createStorageContext(ctx.requestId), account, filesystem,
        pathName, hnsParentPath, isDirectory
      );
      try {
        await this.metadataStore.createBlob(
          createStorageContext(ctx.requestId), blobModel, leaseConditions, modifiedConditions
        );
      } catch (error) {
        if (!existing) {
          await this.unregisterHnsPathAfterFailure(ctx, account, filesystem, pathName);
        }
        throw error;
      }
      if (existing) {
        // The data appended to the replaced file and never flushed is discarded
        await this.metadataStore.deleteUncommittedBlocks(
          createStorageContext(ctx.requestId), account, filesystem, pathName
        );
      }

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
      if (error.code === "PathConflict") {
        return sendDfsError(res, { statusCode: 409, code: "PathConflict", message: error.message });
      }
      if (error.statusCode === 409 ||
          error.code === "PathAlreadyExists" ||
          error.code === "BlobAlreadyExists" ||
          error.storageError?.storageErrorCode === "BlobAlreadyExists") {
        return sendDfsError(res, pathAlreadyExists(pathName));
      }
      if (this.sendStorageError(res, error)) return;
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

      const isDir = isDfsDirectoryMetadata(blobProps.metadata);

      // Like POSIX, the sticky bit of the parent directory restricts deleting
      // its entries to their owner, the owner of the directory and $superuser
      const parentProps = pathName.includes("/")
        ? await this.safeGetBlobProperties(account, filesystem, this.getParentPath(pathName), ctx.requestId)
        : undefined;
      if (this.isRestrictedBySticky(ctx, parentProps?.metadata, blobProps.metadata)) {
        return sendDfsError(res, this.stickyDenied(pathName));
      }

      if (isDir) {
        // List the blobs under this directory prefix (recursive, no delimiter)
        // to check for children. This catches blobs created via both DFS and
        // Blob API, regardless of whether they're in the HNS hierarchy table.
        const prefix = pathName + "/";
        const [firstChildren] = await this.metadataStore.listBlobs(
          createStorageContext(ctx.requestId), account, filesystem,
          undefined, undefined, prefix, 1
        );

        if (firstChildren.length > 0 && !recursive) {
          return sendDfsError(res, directoryNotEmpty(pathName));
        }

        if (recursive && firstChildren.length > 0) {
          // Every descendant, across all the pages of the listing
          const allChildren: BlobModel[] = [];
          let marker: string | undefined;
          do {
            const [page, , nextMarker] = await this.metadataStore.listBlobs(
              createStorageContext(ctx.requestId), account, filesystem,
              undefined, undefined, prefix, undefined, marker
            );
            allChildren.push(...page);
            marker = nextMarker;
          } while (marker);

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

          // In ACL mode, emptying a directory requires write and execute on
          // it, and the sticky bit applies to each of its entries
          const denied = this.recursiveDeleteDenial(ctx, pathName, blobProps.metadata, allChildren);
          if (denied) {
            return sendDfsError(res, denied);
          }

          // Delete descendant blobs and their snapshots with bounded
          // concurrency. The lease ID of the request only applies to the
          // descendants holding that lease.
          const BATCH = 16;
          for (let i = 0; i < allChildren.length; i += BATCH) {
            await Promise.all(
              allChildren.slice(i, i + BATCH).map(child =>
                this.metadataStore.deleteBlob(
                  createStorageContext(ctx.requestId), account, filesystem, child.name,
                  {
                    deleteSnapshots: Models.DeleteSnapshotsOptionType.Include,
                    leaseAccessConditions: isLeased(child) ? leaseConditions : undefined
                  }
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
          deleteSnapshots: Models.DeleteSnapshotsOptionType.Include,
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
      if (this.sendStorageError(res, error)) return;
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

      const isDir = isDfsDirectoryMetadata(result.metadata);

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
      if (this.sendStorageError(res, error)) return;
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

      if (isDfsDirectoryMetadata(blob.metadata)) {
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

      // A suffix range ("bytes=-N") requests the last N bytes, and any other
      // range with a missing bound is ignored, like a malformed one
      if (rangeParts && Number.isNaN(rangeParts[0])) {
        rangeParts = Number.isFinite(rangeParts[1]) && rangeParts[1] > 0
          ? [Math.max(0, totalLength - rangeParts[1]), Infinity]
          : undefined;
      }
      if (rangeParts && Number.isNaN(rangeParts[1])) {
        rangeParts = undefined;
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
      if (this.sendStorageError(res, error)) return;
      logger.error(`PathHandler.read error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async listPaths(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    // Normalize the directory ("a/b/", "/a/b" and "a/b" name the same path),
    // so that its ACL is the one evaluated
    const directory = ((req.query.directory as string | undefined) ?? "")
      .replace(/^\/+|\/+$/g, "") || undefined;
    const recursive = req.query.recursive === "true";
    const maxResults = Math.max(1, Math.min(5000, parseInt(req.query.maxResults as string, 10) || 5000));
    const continuation = req.query.continuation as string | undefined;

    // ACL enforcement: require read on the target directory (or filesystem root)
    // The filesystem root has no stored ACL: evaluate its default ACL
    let aclAllowed: boolean;
    // Listing a directory requires read and execute on it, like ADLS Gen2
    if (!directory) {
      aclAllowed = this.enforceRootAcl(ctx, res, "r") && this.enforceRootAcl(ctx, res, "x");
    } else if (await this.safeGetBlobProperties(account, filesystem, directory, ctx.requestId)) {
      aclAllowed = await this.enforceAcl(ctx, res, account, filesystem, directory, "r") &&
        await this.enforceAcl(ctx, res, account, filesystem, directory, "x");
    } else {
      // Without a directory marker (e.g. blobs created through the Blob API),
      // authorize the listing against the nearest existing ancestor rather
      // than treating the missing directory as allowed
      aclAllowed = await this.enforceParentAcl(ctx, res, account, filesystem, directory, ["r", "x"]);
    }
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

        const isDir = isDfsDirectoryMetadata(blob.metadata);
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

      // A recursive listing doesn't include the content of the directories
      // the caller can't list (read and execute)
      const listedPaths = recursive
        ? await this.withoutUnlistableEntries(ctx, account, filesystem, directory ?? "", blobs, paths)
        : paths;

      res.status(200);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      if (nextMarker) {
        res.setHeader("x-ms-continuation", nextMarker);
      }

      res.json({ paths: listedPaths });
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, filesystemNotFound(filesystem));
      }
      if (this.sendStorageError(res, error)) return;
      logger.error(`PathHandler.listPaths error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  public async update(req: Request, res: Response): Promise<void> {
    const ctx = getDfsContext(res);
    const account = ctx.account || EMULATOR_ACCOUNT_NAME;
    const filesystem = ctx.filesystem!;
    const pathName = ctx.path!;

    // ACL enforcement for update operations. Changing the access control of
    // a path is reserved to its owner (checked by the action) rather than
    // granted by write permission, so it only requires reaching the path.
    const action = req.query.action as string;
    const isAccessControlChange =
      action === "setAccessControl" || action === "setAccessControlRecursive";
    if (!(await this.enforceAcl(ctx, res, account, filesystem, pathName, isAccessControlChange ? undefined : "w"))) return;

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
    const lockCtx = getDfsContext(res);
    return this.withPathLock(lockCtx, () => this.appendDataSerialized(req, res));
  }

  private async appendDataSerialized(req: Request, res: Response): Promise<void> {
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
      // Validate position matches the current expected next offset (contiguity
      // enforcement). Appends and flushes of a path are serialized, so a
      // concurrent append at the same position fails this check.
      const blobProps = await this.metadataStore.getBlobProperties(
        createStorageContext(ctx.requestId), account, filesystem, pathName, undefined, leaseConditions
      );
      // Appending is a write: validate the conditional headers like the Blob API
      validateWriteConditions(
        createStorageContext(ctx.requestId), modifiedConditions, blobProps as BlobModel
      );
      const notAFile = this.notAFileError(blobProps, pathName);
      if (notAFile) {
        return sendDfsError(res, notAFile);
      }
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
      if (error.statusCode === 400 && error.storageErrorCode) {
        // e.g. Md5Mismatch or InvalidMd5
        return sendDfsError(res, {
          statusCode: 400,
          code: error.storageErrorCode,
          message: error.storageErrorMessage || error.message
        });
      }
      if (this.sendStorageError(res, error)) return;
      logger.error(`PathHandler.appendData error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  private async flushData(req: Request, res: Response): Promise<void> {
    const lockCtx = getDfsContext(res);
    return this.withPathLock(lockCtx, () => this.flushDataSerialized(req, res));
  }

  private async flushDataSerialized(req: Request, res: Response): Promise<void> {
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
      const notAFile = this.notAFileError(blob, pathName);
      if (notAFile) {
        return sendDfsError(res, notAFile);
      }

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
      const offsetOf = (name: string) => {
        const raw = Buffer.from(name, "base64").toString("utf8");
        return raw.startsWith("dfs-") ? parseInt(raw.substring(4), 10) : 0;
      };
      const allBlocks = [...blockList.uncommittedBlocks].sort(
        (a, b) => offsetOf(a.name) - offsetOf(b.name)
      );

      // Like ADLS Gen2, the flush commits the data appended up to its position,
      // which must end a contiguous run of appended data. The data appended
      // beyond it stays uncommitted with retainUncommittedData=true, and is
      // discarded otherwise.
      const committedLength = blob.properties.contentLength ?? 0;
      const sortedBlocks: typeof allBlocks = [];
      let impliedLength = committedLength;
      for (const block of allBlocks) {
        if (impliedLength >= position || offsetOf(block.name) !== impliedLength) {
          break;
        }
        sortedBlocks.push(block);
        impliedLength += block.size ?? 0;
      }
      if (position !== impliedLength) {
        return sendDfsError(res, invalidFlushPosition(position, impliedLength));
      }
      const retainedBlocks = req.query.retainUncommittedData === "true"
        ? (await this.metadataStore.getUncommittedBlocks(
            createStorageContext(ctx.requestId), account, filesystem, pathName
          )).filter(block => offsetOf(block.name) >= position)
        : [];

      // Include previously committed blocks so multi-cycle append→flush is correct
      const previouslyCommitted = (blob.committedBlocksInOrder || []).map(b => ({
        blockName: b.name,
        blockCommitType: "Committed"
      }));

      // Content uploaded in one piece (Blob API Put Blob, or Put Blob From
      // URL) isn't stored as blocks: stage it as the first block, so that it
      // is kept in front of the appended data
      if (previouslyCommitted.length === 0 && committedLength > 0 && blob.persistency) {
        const contentBlock: BlockModel = {
          accountName: account,
          containerName: filesystem,
          blobName: pathName,
          isCommitted: false,
          // Same format as the appended blocks, at offset 0, which no append
          // uses here as the file already has content
          name: Buffer.from(`dfs-${"0".padStart(20, "0")}`).toString("base64"),
          size: committedLength,
          persistency: blob.persistency
        };
        await this.metadataStore.stageBlock(
          createStorageContext(ctx.requestId), contentBlock, leaseConditions
        );
        previouslyCommitted.push({ blockName: contentBlock.name, blockCommitType: "Uncommitted" });
      }

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
          contentType: blob.properties.contentType || "application/octet-stream",
          // The MD5 of the previous content no longer matches
          contentMD5: undefined,
          // Content properties of the request, including x-ms-content-md5
          ...this.contentProperties(req)
        }
      };

      await this.metadataStore.commitBlockList(
        createStorageContext(ctx.requestId), updatedBlob, commitList, leaseConditions, modifiedConditions
      );

      // Committing discards every uncommitted block: stage again the data
      // appended beyond the flushed position that is retained
      for (const block of retainedBlocks) {
        await this.metadataStore.stageBlock(
          createStorageContext(ctx.requestId), block, leaseConditions
        );
      }

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
      if (this.sendStorageError(res, error)) return;
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
        metadata["dfsAcl"] = normalizeAcl(acl);
        metadata["dfsAclPermissions"] = permissions
          ? normalizePermissions(permissions)!
          : permissionsFromAcl(metadata["dfsAcl"], metadata["dfsAclPermissions"]);
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
      if (this.sendStorageError(res, error)) return;
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
      // Like ADLS Gen2, the failed paths are reported, and unless forceFlag is
      // true, the operation stops at the first failure; its continuation then
      // resumes after the failed path
      const forceFlag = req.query.forceFlag === "true";
      const failedEntries: { name: string; type: string; errorMessage: string }[] = [];
      let stoppedAfter: string | undefined;
      const isDirectoryPath = new Map(blobs.map(b => [b.name, isDfsDirectoryMetadata(b.metadata)]));
      const recordFailure = (name: string, errorMessage: string) => {
        failureCount++;
        failedEntries.push({
          name,
          type: isDirectoryPath.get(name) ? "DIRECTORY" : "FILE",
          errorMessage
        });
        if (!forceFlag) {
          stoppedAfter = name;
        }
      };

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
            if (blobPath === pathName) {
              return sendDfsError(res, {
                statusCode: 403,
                code: "AuthorizationPermissionMismatch",
                message: "This request is not authorized to change the access control of this path. Only the current owner or $superuser may do so."
              });
            }
            recordFailure(blobPath, "This request is not authorized to change the access control of this path.");
            if (stoppedAfter !== undefined) break;
            continue;
          }
          const isDir = isDfsDirectoryMetadata(metadata);

          if (acl) {
            if (mode === "set") {
              metadata["dfsAcl"] = normalizeAcl(acl);
            } else if (mode === "modify") {
              // Merge: new ACL entries override existing ones with same qualifier
              const existing = (metadata["dfsAcl"] || "").split(",").filter(Boolean);
              const incoming = normalizeAcl(acl).split(",");
              const merged = new Map<string, string>();
              for (const entry of existing) {
                merged.set(aclEntryKey(entry), entry);
              }
              for (const entry of incoming) {
                merged.set(aclEntryKey(entry), entry);
              }
              metadata["dfsAcl"] = Array.from(merged.values()).join(",");
            } else if (mode === "remove") {
              // Remove specified ACL entries
              const existing = (metadata["dfsAcl"] || "").split(",").filter(Boolean);
              const toRemove = new Set(normalizeAcl(acl).split(",").map(aclEntryKey));
              metadata["dfsAcl"] = existing
                .filter((e: string) => !toRemove.has(aclEntryKey(e)))
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
        } catch (error: any) {
          // A failure on the path named by the request fails the request (e.g.
          // 404 or a failed condition); other paths count as failures
          if (blobPath === pathName) {
            throw error;
          }
          recordFailure(blobPath, error?.storageErrorMessage || error?.message || "The operation failed.");
          if (stoppedAfter !== undefined) break;
        }
      }

      res.status(200);
      res.setHeader("x-ms-request-id", ctx.requestId);
      res.setHeader("x-ms-version", BLOB_API_VERSION);
      const nextContinuation = stoppedAfter ?? nextMarker;
      if (nextContinuation) {
        res.setHeader("x-ms-continuation", nextContinuation);
      }

      res.json({
        directoriesSuccessful,
        filesSuccessful,
        failureCount,
        failedEntries
      });
    } catch (error: any) {
      if (error.statusCode === 404) {
        return sendDfsError(res, pathNotFound(pathName));
      }
      if (this.sendStorageError(res, error)) return;
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

      // Like ADLS Gen2, x-ms-properties replaces the user properties: the
      // properties it doesn't list are removed, and omitting it removes them
      // all. The DFS internal keys (directory marker, ACL) are kept.
      const metadata: { [key: string]: string } = {};
      for (const [key, value] of Object.entries(result.metadata || {})) {
        if (DFS_INTERNAL_METADATA_KEYS_LOWER_CASE.has(key.toLowerCase())) {
          metadata[key] = value as string;
        }
      }
      Object.assign(metadata, this.userProperties(req.headers["x-ms-properties"] as string | undefined));

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
      if (this.sendStorageError(res, error)) return;
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
      const source = parseRenameSource(renameSource, account, isPathStyleRequest(ctx, account));
      if (typeof source === "string") {
        return sendDfsError(res, invalidSourceOrDestination(source));
      }
      sourceFilesystem = source.filesystem;
      sourcePath = source.path;

      // ACL enforcement: like POSIX, moving an entry requires write and execute
      // on the directories containing the source and the destination. These
      // checks come first, so that a caller who can't reach the source can't
      // learn whether it exists.
      if (!(await this.enforceParentAcl(ctx, res, account, sourceFilesystem, sourcePath!, ["w", "x"]))) return;
      if (!(await this.enforceParentAcl(ctx, res, account, destFilesystem, destPath, ["w", "x"]))) return;

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
          return sendDfsError(res, {
            statusCode: 404,
            code: "SourcePathNotFound",
            message: `The source path for a rename operation does not exist: ${sourcePath}`
          });
        }
        throw err;
      }

      // Overwriting an existing destination also requires write on it
      if (!(await this.enforceAcl(ctx, res, account, destFilesystem, destPath, "w"))) return;

      // The sticky bit of the source directory, and of the destination
      // directory when the destination exists, restricts renaming their entries
      if (this.oauth === OAuthLevel.ACL && ctx.identity) {
        const sourceParent = sourcePath!.includes("/")
          ? await this.safeGetBlobProperties(account, sourceFilesystem, this.getParentPath(sourcePath!), ctx.requestId)
          : undefined;
        if (this.isRestrictedBySticky(ctx, sourceParent?.metadata, sourceBlob.metadata)) {
          return sendDfsError(res, this.stickyDenied(sourcePath!));
        }
        const existingDest = await this.safeGetBlobProperties(account, destFilesystem, destPath, ctx.requestId);
        if (existingDest && destPath.includes("/")) {
          const destParent = await this.safeGetBlobProperties(account, destFilesystem, this.getParentPath(destPath), ctx.requestId);
          if (this.isRestrictedBySticky(ctx, destParent?.metadata, existingDest.metadata)) {
            return sendDfsError(res, this.stickyDenied(destPath));
          }
        }
      }

      const isDir = isDfsDirectoryMetadata(sourceBlob.metadata);

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
        const destIsDir = isDfsDirectoryMetadata(destBlob.metadata);
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
        await this.ensureIntermediateDirectories(
          account, destFilesystem, destPath, now, ctx.requestId, this.callerOwnerId(ctx)
        );
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
        if (err.statusCode === 409 && err.storageErrorCode === "BlobAlreadyExists") {
          // An existing destination with If-None-Match: *
          return sendDfsError(res, pathAlreadyExists(destPath));
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
        if (error.storageErrorCode === "ContainerNotFound") {
          return sendDfsError(res, filesystemNotFound(destFilesystem));
        }
        return sendDfsError(res, {
          statusCode: 404,
          code: "SourcePathNotFound",
          message: `The source path for a rename operation does not exist: ${sourcePath ?? destPath}`
        });
      }
      if (this.sendStorageError(res, error)) return;
      logger.error(`PathHandler.renamePath error: ${error.message}`, ctx.requestId);
      sendDfsError(res, internalError(error.message));
    }
  }

  /**
   * Create the missing ancestor directories of a path. Like the directories
   * created explicitly, they inherit the default ACL of their parent and are
   * owned by the caller.
   *
   * @returns The metadata of the directory containing the path.
   */
  private async ensureIntermediateDirectories(
    account: string,
    filesystem: string,
    pathName: string,
    now: Date,
    requestId: string,
    ownerId?: string
  ): Promise<{ [key: string]: string } | undefined> {
    const parts = pathName.split("/");
    let parentMetadata: { [key: string]: string } | undefined;
    // Skip the last part (the file/dir being created)
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/");
      const existing = await this.safeGetBlobProperties(account, filesystem, dirPath, requestId);
      if (existing && !isDfsDirectoryMetadata(existing.metadata)) {
        // A file exists at this path — cannot use it as a parent directory
        throw Object.assign(new Error(`"${dirPath}" is a file, not a directory.`), { statusCode: 409, code: "PathConflict" });
      }
      if (existing) {
        parentMetadata = existing.metadata;
      } else {
        const dirMetadata: { [key: string]: string } = {
          ...this.inheritedAccessControl(parentMetadata, true, ownerId),
          [HNS_DIRECTORY_METADATA_KEY]: "true"
        };
        parentMetadata = dirMetadata;
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
          metadata: dirMetadata,
          committedBlocksInOrder: [],
          persistency: undefined as any
        };
        // Register intermediate directory in HNS hierarchy before creating
        // it, like a path created explicitly
        const parentDir = i > 1 ? parts.slice(0, i - 1).join("/") : null;
        await this.metadataStore.registerHnsPath(
          createStorageContext(requestId), account, filesystem,
          dirPath, parentDir, true
        );
        try {
          await this.metadataStore.createBlob(createStorageContext(requestId), dirBlob);
        } catch (error: any) {
          // Ignore a directory created by a concurrent request, but not other
          // failures: the path would otherwise be created without its parent.
          if (error?.statusCode !== 409) {
            await this.unregisterHnsPathAfterFailure({ requestId } as IDfsContext, account, filesystem, dirPath);
            throw error;
          }
          // Created concurrently: use the directory as it was created
          parentMetadata = (await this.safeGetBlobProperties(account, filesystem, dirPath, requestId))?.metadata;
        }
      }
    }
    return parentMetadata;
  }

  /**
   * Run an operation once the previous append and flush operations of the
   * same path are done.
   */
  private async withPathLock(ctx: IDfsContext, operation: () => Promise<void>): Promise<void> {
    const key = `${ctx.account}/${ctx.filesystem}/${ctx.path}`;
    const previous = this.pathLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>(resolve => (release = resolve));
    const tail = previous.then(() => done);
    this.pathLocks.set(key, tail);
    await previous;
    try {
      await operation();
    } finally {
      release();
      if (this.pathLocks.get(key) === tail) {
        this.pathLocks.delete(key);
      }
    }
  }

  /**
   * Remove the hierarchy entry registered for a path whose blob couldn't be
   * created. A failure of this cleanup is logged, as the original error is
   * the one to report.
   */
  private async unregisterHnsPathAfterFailure(
    ctx: IDfsContext,
    account: string,
    filesystem: string,
    pathName: string
  ): Promise<void> {
    try {
      await this.metadataStore.unregisterHnsPath(
        createStorageContext(ctx.requestId), account, filesystem, pathName
      );
    } catch (error: any) {
      logger.error(
        `PathHandler: failed to remove the hierarchy entry of ${pathName} after a failed creation: ${error.message}`,
        ctx.requestId
      );
    }
  }

  /**
   * The owner and access control a new path inherits, like ADLS Gen2: the
   * caller owns it, it belongs to the owning group of its parent directory,
   * and the default ACL entries of that directory become its access ACL (and
   * also its default ACL when it is a directory).
   */
  private inheritedAccessControl(
    parentMetadata: { [key: string]: string } | undefined,
    isDirectory: boolean,
    ownerId: string | undefined
  ): { [key: string]: string } {
    const result: { [key: string]: string } = {};
    if (ownerId) {
      result["dfsAclOwner"] = ownerId;
    }
    if (parentMetadata?.dfsAclGroup) {
      result["dfsAclGroup"] = parentMetadata.dfsAclGroup;
    }

    const defaults = (parentMetadata?.dfsAcl || "")
      .split(",")
      .filter(entry => entry.startsWith("default:"));
    if (defaults.length > 0) {
      const access = defaults.map(entry => entry.substring("default:".length)).join(",");
      result["dfsAcl"] = isDirectory ? `${access},${defaults.join(",")}` : access;
      result["dfsAclPermissions"] = permissionsFromAcl(access, undefined);
    }
    return result;
  }

  /**
   * The identity owning the paths created by the caller in ACL mode, or
   * undefined when ACL enforcement isn't active.
   */
  private callerOwnerId(ctx: IDfsContext): string | undefined {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity) {
      return undefined;
    }
    return ctx.identity.oid || ctx.identity.upn || undefined;
  }

  /**
   * Enforce ACL on a path operation when --oauth acl is enabled.
   * Returns true if allowed, sends error response and returns false if denied.
   * Execute permission is required on the ancestors of the path, except the
   * root, and requiredPermission on the path itself unless it's undefined.
   * A path that doesn't exist yet is not checked; operations creating it are
   * authorized against its parent directory with enforceParentAcl().
   *
   * NOTE (accepted emulator limitation): this check and the mutating operation
   * that follows it are two separate round-trips (TOCTOU) — a path can be
   * deleted/renamed/re-ACL'd by a concurrent request between the check and the
   * actual operation; low real-world severity for an emulator, but worth
   * keeping in mind if this code is ever adapted for a concurrent deployment.
   */
  private async enforceAcl(
    ctx: IDfsContext,
    res: Response,
    account: string,
    filesystem: string,
    pathName: string,
    requiredPermission: AclPermission | undefined
  ): Promise<boolean> {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity) {
      return true; // ACL enforcement not active
    }

    try {
      // Traversal is checked first, so that a caller who can't reach a path
      // can't learn whether it exists
      const traversal = await this.checkTraversal(
        ctx, account, filesystem, this.getAncestors(pathName)
      );
      if (!traversal.result.allowed) {
        return this.sendAclResult(ctx, res, traversal.path, ["x"], traversal.result);
      }

      const blobProps = await this.safeGetBlobProperties(account, filesystem, pathName, ctx.requestId);
      if (!blobProps) {
        return true; // Path doesn't exist yet — authorized against its parent
      }
      if (requiredPermission === undefined) {
        return true; // Only reaching the path is required
      }

      return this.sendAclResult(
        ctx, res, pathName, [requiredPermission],
        this.evaluateAcl(ctx, blobProps.metadata, [requiredPermission])
      );
    } catch (error: any) {
      if (this.sendStorageError(res, error)) return false;
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
      if (this.sendStorageError(res, error)) return false;
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

  /**
   * Send the DFS error matching a client error of the metadata store, keeping
   * its status and storage error code (e.g. ConditionNotMet, LeaseIdMissing,
   * LeaseIdMismatchWithBlobOperation), or 304 Not Modified.
   * Returns false when the error isn't a client error.
   */
  private sendStorageError(res: Response, error: any): boolean {
    const status = error?.statusCode;
    if (status === 304) {
      res.status(304);
      res.end();
      return true;
    }
    const code = error?.storageErrorCode || error?.code;
    if (typeof status === "number" && status >= 400 && status < 500 && typeof code === "string") {
      sendDfsError(res, {
        statusCode: status,
        code,
        message: error.storageErrorMessage || error.message
      });
      return true;
    }
    return false;
  }

  /**
   * Whether the sticky bit of a directory denies the caller removing or
   * renaming one of its entries: with the sticky bit, only the owner of the
   * entry, the owner of the directory and $superuser may do it.
   */
  private isRestrictedBySticky(
    ctx: IDfsContext,
    directoryMetadata: { [key: string]: string } | undefined,
    entryMetadata: { [key: string]: string } | undefined
  ): boolean {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity || !directoryMetadata) {
      return false;
    }
    const permissions = directoryMetadata.dfsAclPermissions || "";
    if (permissions.charAt(8) !== "t" && permissions.charAt(8) !== "T") {
      return false;
    }
    const callerId = ctx.identity.oid || ctx.identity.upn || "";
    return callerId !== "$superuser" &&
      callerId !== (directoryMetadata.dfsAclOwner || "$superuser") &&
      callerId !== (entryMetadata?.dfsAclOwner || "$superuser");
  }

  private stickyDenied(pathName: string): DfsError {
    return {
      statusCode: 403,
      code: "AuthorizationPermissionMismatch",
      message: `This request is not authorized to remove "${pathName}": its directory has the sticky bit, and only the owner of the path or of the directory may do so.`
    };
  }

  /**
   * In ACL mode, the error denying a recursive delete: emptying a directory
   * requires write and execute on it, and on each directory below it, and the
   * sticky bit of these directories applies to their entries.
   */
  private recursiveDeleteDenial(
    ctx: IDfsContext,
    pathName: string,
    directoryMetadata: { [key: string]: string } | undefined,
    children: BlobModel[]
  ): DfsError | undefined {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity) {
      return undefined;
    }

    const directories = new Map<string, { [key: string]: string } | undefined>([
      [pathName, directoryMetadata]
    ]);
    for (const child of children) {
      if (isDfsDirectoryMetadata(child.metadata)) {
        directories.set(child.name, child.metadata);
      }
    }

    for (const [directory, metadata] of directories) {
      const result = this.evaluateAcl(ctx, metadata, ["w", "x"]);
      if (!result.allowed) {
        return {
          statusCode: 403,
          code: "AuthorizationPermissionMismatch",
          message: `This request is not authorized to perform this operation using this permission. Required: wx on "${directory}"`
        };
      }
    }
    for (const child of children) {
      const parent = directories.get(this.getParentPath(child.name));
      if (this.isRestrictedBySticky(ctx, parent, child.metadata)) {
        return this.stickyDenied(child.name);
      }
    }
    return undefined;
  }

  /**
   * The error for appending or flushing to a path that isn't a file: a
   * directory, or a page or append blob created through the Blob API.
   */
  private notAFileError(blob: { metadata?: { [key: string]: string }; properties: Models.BlobPropertiesInternal }, pathName: string): DfsError | undefined {
    if (isDfsDirectoryMetadata(blob.metadata)) {
      return {
        statusCode: 409,
        code: "PathConflict",
        message: `The operation isn't supported on the directory "${pathName}".`
      };
    }
    if (blob.properties.blobType !== undefined && blob.properties.blobType !== Models.BlobType.BlockBlob) {
      return {
        statusCode: 409,
        code: "InvalidBlobType",
        message: `The operation isn't supported on a ${blob.properties.blobType} like "${pathName}".`
      };
    }
    return undefined;
  }

  /**
   * In ACL mode, the entries of a recursive listing below directories the
   * caller can't list (read and execute) are removed.
   */
  private async withoutUnlistableEntries<T extends { name: string }>(
    ctx: IDfsContext,
    account: string,
    filesystem: string,
    directory: string,
    blobs: BlobModel[],
    entries: T[]
  ): Promise<T[]> {
    if (this.oauth !== OAuthLevel.ACL || !ctx.identity) {
      return entries;
    }

    const metadataOf = new Map<string, { [key: string]: string } | undefined>();
    for (const blob of blobs) {
      metadataOf.set(blob.name, blob.metadata);
    }
    const listable = new Map<string, boolean>();
    const canList = async (dir: string): Promise<boolean> => {
      if (!listable.has(dir)) {
        const metadata = metadataOf.has(dir)
          ? metadataOf.get(dir)
          : (await this.safeGetBlobProperties(account, filesystem, dir, ctx.requestId))?.metadata;
        listable.set(dir, this.evaluateAcl(ctx, metadata, ["r", "x"]).allowed);
      }
      return listable.get(dir)!;
    };

    const result: T[] = [];
    for (const entry of entries) {
      let allowed = true;
      for (let dir = this.getParentPath(entry.name); dir !== "" && dir !== directory; dir = this.getParentPath(dir)) {
        if (!(await canList(dir))) {
          allowed = false;
          break;
        }
      }
      if (allowed) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * The content properties of a file set by the x-ms-content-type,
   * x-ms-content-encoding, x-ms-content-language, x-ms-content-disposition and
   * x-ms-cache-control headers of a create or flush request, and on flush the
   * MD5 of the whole file (x-ms-content-md5).
   */
  private contentProperties(req: Request): Partial<Models.BlobPropertiesInternal> {
    const properties: Partial<Models.BlobPropertiesInternal> = {};
    const header = (name: string) => req.headers[name] as string | undefined;
    if (header("x-ms-content-type") !== undefined) properties.contentType = header("x-ms-content-type");
    if (header("x-ms-content-encoding") !== undefined) properties.contentEncoding = header("x-ms-content-encoding");
    if (header("x-ms-content-language") !== undefined) properties.contentLanguage = header("x-ms-content-language");
    if (header("x-ms-content-disposition") !== undefined) properties.contentDisposition = header("x-ms-content-disposition");
    if (header("x-ms-cache-control") !== undefined) properties.cacheControl = header("x-ms-cache-control");
    if (header("x-ms-content-md5") !== undefined) {
      properties.contentMD5 = new Uint8Array(Buffer.from(header("x-ms-content-md5")!, "base64"));
    }
    return properties;
  }

  /**
   * The user properties of an x-ms-properties header, without the DFS internal
   * keys, matched case-insensitively.
   */
  private userProperties(header: string | undefined): { [key: string]: string } {
    const properties = parseDfsProperties(header);
    for (const key of Object.keys(properties)) {
      if (DFS_INTERNAL_METADATA_KEYS_LOWER_CASE.has(key.toLowerCase())) {
        delete properties[key];
      }
    }
    return properties;
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
