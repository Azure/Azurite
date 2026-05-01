import express from "express";

import IAccountDataStore from "../common/IAccountDataStore";
import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import IExtentStore from "../common/persistence/IExtentStore";
import { OAuthLevel } from "../common/models";
import { RequestListener } from "../common/ServerBase";
import IBlobMetadataStore from "./persistence/IBlobMetadataStore";
import createDfsContextMiddleware, { getDfsContext } from "./dfs/DfsContext";
import { DfsOperation } from "./dfs/DfsOperation";
import createDfsAuthenticationMiddleware from "./dfs/DfsAuthenticationMiddleware";
import FilesystemHandler from "./dfs/handlers/FilesystemHandler";
import PathHandler from "./dfs/handlers/PathHandler";
import { sendDfsError, internalError, hierarchicalNamespaceNotEnabled, filesystemNotFound } from "./dfs/DfsErrorFactory";
import { createStorageContext } from "./dfs/DfsContextFactory";
import { EMULATOR_ACCOUNT_NAME } from "./utils/constants";

/*
 * Generated DFS layer at src/blob/generated-dfs/ provides:
 *   - OpenAPI/Swagger spec:  swagger/dfs-storage-2023-11-03.json
 *   - AutoRest config:       swagger/dfs.md
 *   - Typed interfaces:      generated-dfs/handlers/IFilesystemHandler, IPathHandler
 *   - Operation enum:        generated-dfs/artifacts/operation.ts
 *   - Models:                generated-dfs/artifacts/models.ts
 *   - Dispatch specs:        generated-dfs/artifacts/specifications.ts
 *   - Handler mappers:       generated-dfs/handlers/handlerMappers.ts
 *
 * The concrete handlers (FilesystemHandler, PathHandler) currently use Express
 * req/res directly. A future refactor can adapt them to the generated
 * (options, context) → response pattern with a deserializer/serializer
 * middleware layer, matching the blob endpoint architecture exactly.
 */

/**
 * DfsRequestListenerFactory creates the Express application for the DFS endpoint.
 *
 * Architecture follows the generated interface pattern from `src/blob/generated-dfs/`:
 *
 *   1. Context middleware     — extracts account/filesystem/path from URL
 *   2. Dispatch middleware    — matches request to DfsOperation
 *   3. Authentication         — reuses blob SharedKey/SAS/OAuth authenticators
 *   4. HNS validation         — rejects DFS calls on non-HNS containers
 *   5. Handler middleware     — routes to handler method
 *   6. Error middleware       — DFS JSON error responses
 *
 * Handler implementations (FilesystemHandler, PathHandler) fulfill the contracts
 * defined by the generated IFilesystemHandler and IPathHandler interfaces.
 */
export default class DfsRequestListenerFactory implements IRequestListenerFactory {
  public constructor(
    private readonly metadataStore: IBlobMetadataStore,
    private readonly extentStore: IExtentStore,
    private readonly accountDataStore: IAccountDataStore,
    private readonly oauth?: OAuthLevel,
    private readonly enableHierarchicalNamespace: boolean = true,
    private readonly skipApiVersionCheck?: boolean,
    private readonly disableProductStyleUrl?: boolean
  ) {}

  /**
   * Returns the DFS middleware pipeline as an Express Router.
   * Raw body parsing is NOT included — callers that embed this router into a
   * larger app (e.g. the blob server) must apply `express.raw()` themselves
   * before delegating to this router.
   */
  public createRouter(): express.Router {
    const router = express.Router();

    const filesystemHandler = new FilesystemHandler(this.metadataStore, this.enableHierarchicalNamespace);
    const pathHandler = new PathHandler(this.metadataStore, this.extentStore, this.oauth);

    // 1. Parse DFS context (account, filesystem, path)
    router.use(createDfsContextMiddleware(this.skipApiVersionCheck, this.disableProductStyleUrl));

    // 2. Dispatch: determine DFS operation from request
    router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ctx = getDfsContext(res);
      const resource = req.query.resource as string | undefined;
      const action = req.query.action as string | undefined;
      const method = req.method.toUpperCase();

      let operation: DfsOperation | undefined;

      if (resource === "account" && method === "GET") {
        operation = DfsOperation.Filesystem_List;
      } else if (resource === "filesystem") {
        if (ctx.path) {
          operation = DfsOperation.Filesystem_ListPaths;
        } else {
          switch (method) {
            case "PUT": operation = DfsOperation.Filesystem_Create; break;
            case "DELETE": operation = DfsOperation.Filesystem_Delete; break;
            case "HEAD": operation = DfsOperation.Filesystem_GetProperties; break;
            case "PATCH": operation = DfsOperation.Filesystem_SetProperties; break;
            case "GET": operation = DfsOperation.Filesystem_ListPaths; break;
          }
        }
      } else if (ctx.filesystem && ctx.path) {
        const leaseAction = req.headers["x-ms-lease-action"] as string | undefined;
        if (leaseAction) {
          operation = DfsOperation.Path_Lease;
        } else if (req.headers["x-ms-rename-source"] && method === "PUT") {
          operation = DfsOperation.Path_Rename;
        } else if (resource === "file" || resource === "directory") {
          operation = DfsOperation.Path_Create;
        } else if (method === "HEAD") {
          operation = action === "getAccessControl"
            ? DfsOperation.Path_GetAccessControl
            : DfsOperation.Path_GetProperties;
        } else if (method === "GET") {
          operation = DfsOperation.Path_Read;
        } else if (method === "DELETE") {
          operation = DfsOperation.Path_Delete;
        } else if (action) {
          // PATCH with action (append, flush, setAccessControl, etc.)
          operation = DfsOperation.Path_Update;
        } else if (method === "PUT") {
          operation = DfsOperation.Path_Create;
        } else if (method === "PATCH") {
          operation = DfsOperation.Path_Update;
        }
      } else if (ctx.filesystem && !ctx.path) {
        switch (method) {
          case "GET": operation = DfsOperation.Filesystem_ListPaths; break;
          case "PUT": operation = DfsOperation.Filesystem_Create; break;
          case "DELETE": operation = DfsOperation.Filesystem_Delete; break;
          case "HEAD": operation = DfsOperation.Filesystem_GetProperties; break;
        }
      }

      if (operation) {
        ctx.operation = operation;
      }

      next();
    });

    // 3. Authentication middleware
    router.use(createDfsAuthenticationMiddleware(
      this.accountDataStore,
      this.metadataStore,
      logger,
      this.oauth
    ));

    // 4. HNS validation: reject DFS operations on non-HNS containers.
    // Filesystem_Create is exempt (container doesn't exist yet).
    // Filesystem_List is exempt (not scoped to a single container).
    router.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ctx = getDfsContext(res);
      const operation = ctx.operation;

      if (
        !ctx.filesystem ||
        operation === DfsOperation.Filesystem_Create ||
        operation === DfsOperation.Filesystem_List
      ) {
        return next();
      }

      const filesystem = ctx.filesystem;
      try {
        const account = ctx.account || EMULATOR_ACCOUNT_NAME;
        const container = await this.metadataStore.getContainerProperties(
          createStorageContext(ctx.requestId),
          account,
          filesystem
        );
        if (!container) {
          return sendDfsError(res, filesystemNotFound(filesystem));
        }
        if (container.metadata?.["azurite_hns_enabled"] !== "true") {
          return sendDfsError(res, hierarchicalNamespaceNotEnabled(filesystem));
        }
      } catch (err: any) {
        if (err.statusCode === 404) {
          return sendDfsError(res, filesystemNotFound(filesystem));
        }
        return sendDfsError(res, internalError(err.message));
      }

      next();
    });

    // 5. Route to handler
    router.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const ctx = getDfsContext(res);
        const operation = ctx.operation;

        switch (operation) {
          case DfsOperation.Filesystem_Create:
            return await filesystemHandler.create(req, res);
          case DfsOperation.Filesystem_Delete:
            return await filesystemHandler.delete(req, res);
          case DfsOperation.Filesystem_GetProperties:
            return await filesystemHandler.getProperties(req, res);
          case DfsOperation.Filesystem_List:
            return await filesystemHandler.list(req, res);
          case DfsOperation.Filesystem_SetProperties:
            return await filesystemHandler.setProperties(req, res);
          case DfsOperation.Filesystem_ListPaths:
            return await pathHandler.listPaths(req, res);
          case DfsOperation.Path_Create:
          case DfsOperation.Path_Rename:
            return await pathHandler.create(req, res);
          case DfsOperation.Path_Delete:
            return await pathHandler.delete(req, res);
          case DfsOperation.Path_GetProperties:
          case DfsOperation.Path_GetAccessControl:
            return await pathHandler.getProperties(req, res);
          case DfsOperation.Path_Read:
            return await pathHandler.read(req, res);
          case DfsOperation.Path_Update:
            return await pathHandler.update(req, res);
          case DfsOperation.Path_Lease:
            return await pathHandler.lease(req, res);
          default:
            res.status(400).json({
              error: {
                code: "UnsupportedOperation",
                message: `The requested operation is not supported.`
              }
            });
        }
      } catch (error: any) {
        next(error);
      }
    });

    // 6. Error handler
    router.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      sendDfsError(res, internalError(error.message));
    });

    return router;
  }

  public createRequestListener(): RequestListener {
    const app = express().disable("x-powered-by");
    // Raw body parsing needed for append/update operations.
    app.use(express.raw({ type: "*/*", limit: "256mb" }));
    app.use(this.createRouter());
    return app;
  }
}
