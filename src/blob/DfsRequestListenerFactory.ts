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
import { sendDfsError, internalError } from "./dfs/DfsErrorFactory";

export default class DfsRequestListenerFactory implements IRequestListenerFactory {
  public constructor(
    private readonly metadataStore: IBlobMetadataStore,
    private readonly extentStore: IExtentStore,
    private readonly accountDataStore: IAccountDataStore,
    private readonly oauth?: OAuthLevel,
    private readonly enableHierarchicalNamespace: boolean = true
  ) {}

  public createRequestListener(): RequestListener {
    const app = express().disable("x-powered-by");

    const filesystemHandler = new FilesystemHandler(this.metadataStore, this.enableHierarchicalNamespace);
    const pathHandler = new PathHandler(this.metadataStore, this.extentStore);

    // Parse raw body for append operations
    app.use(express.raw({ type: "*/*", limit: "256mb" }));

    // Parse DFS context (account, filesystem, path)
    app.use(createDfsContextMiddleware());

    // Dispatch: determine DFS operation from request
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
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

    // Authentication middleware
    app.use(createDfsAuthenticationMiddleware(
      this.accountDataStore,
      this.metadataStore,
      logger,
      this.oauth
    ));

    // Route to handler
    app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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

    // Error handler
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      sendDfsError(res, internalError(error.message));
    });

    return app;
  }
}
