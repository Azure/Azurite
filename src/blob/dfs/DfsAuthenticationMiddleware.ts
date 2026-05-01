import { decode } from "jsonwebtoken";
import { NextFunction, Request, RequestHandler, Response } from "express";

import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import IAuthenticator from "../authentication/IAuthenticator";
import AccountSASAuthenticator from "../authentication/AccountSASAuthenticator";
import BlobSASAuthenticator from "../authentication/BlobSASAuthenticator";
import BlobSharedKeyAuthenticator from "../authentication/BlobSharedKeyAuthenticator";
import BlobTokenAuthenticator from "../authentication/BlobTokenAuthenticator";
import BlobStorageContext from "../context/BlobStorageContext";
import ExpressRequestAdapter from "../generated/ExpressRequestAdapter";

import Operation from "../generated/artifacts/operation";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { getDfsContext, IDfsAuthenticatedIdentity } from "./DfsContext";
import { DfsOperation } from "./DfsOperation";
import { sendDfsError } from "./DfsErrorFactory";
import { OAuthLevel } from "../../common/models";
import { BEARER_TOKEN_PREFIX } from "../../common/utils/constants";

const DEFAULT_CONTEXT_PATH = "dfs_blob_context";

/**
 * Maps DFS operations to blob operations for SAS permission checking.
 */
function mapDfsOperationToBlobOperation(op?: DfsOperation): Operation {
  switch (op) {
    case DfsOperation.Filesystem_Create:
      return Operation.Container_Create;
    case DfsOperation.Filesystem_Delete:
      return Operation.Container_Delete;
    case DfsOperation.Filesystem_GetProperties:
      return Operation.Container_GetProperties;
    case DfsOperation.Filesystem_SetProperties:
      return Operation.Container_SetMetadata;
    case DfsOperation.Filesystem_List:
      return Operation.Service_ListContainersSegment;
    case DfsOperation.Filesystem_ListPaths:
      return Operation.Container_ListBlobHierarchySegment;
    case DfsOperation.Path_Create:
    case DfsOperation.Path_Rename:
      return Operation.BlockBlob_Upload;
    case DfsOperation.Path_Delete:
      return Operation.Blob_Delete;
    case DfsOperation.Path_GetProperties:
    case DfsOperation.Path_GetAccessControl:
      return Operation.Blob_GetProperties;
    case DfsOperation.Path_Read:
      return Operation.Blob_Download;
    case DfsOperation.Path_Update:
      return Operation.BlockBlob_StageBlock;
    case DfsOperation.Path_Lease:
      return Operation.Blob_AcquireLease;
    default:
      return Operation.Blob_GetProperties;
  }
}

/**
 * Extracts identity claims from a Bearer JWT token.
 * Returns undefined if the token is not a Bearer token or can't be decoded.
 */
function extractIdentityFromRequest(req: Request): IDfsAuthenticatedIdentity | undefined {
  const authHeader = req.header("authorization");
  if (!authHeader || !authHeader.startsWith(BEARER_TOKEN_PREFIX)) {
    return undefined;
  }

  const token = authHeader.substring(BEARER_TOKEN_PREFIX.length + 1);
  try {
    const decoded = decode(token) as { [key: string]: any } | null;
    if (!decoded) return undefined;

    return {
      oid: decoded.oid as string | undefined,
      upn: decoded.upn as string | undefined,
      tid: decoded.tid as string | undefined,
      appid: decoded.appid as string | undefined
    };
  } catch {
    return undefined;
  }
}

export default function createDfsAuthenticationMiddleware(
  accountDataStore: IAccountDataStore,
  metadataStore: IBlobMetadataStore,
  logger: ILogger,
  oauth?: OAuthLevel
): RequestHandler {
  const authenticators: IAuthenticator[] = [
    new BlobSharedKeyAuthenticator(accountDataStore, logger),
    new AccountSASAuthenticator(accountDataStore, metadataStore, logger),
    new BlobSASAuthenticator(accountDataStore, metadataStore, logger)
  ];
  if (oauth !== undefined) {
    authenticators.push(
      new BlobTokenAuthenticator(accountDataStore, oauth, logger)
    );
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const dfsCtx = getDfsContext(res);

    // Build a BlobStorageContext that the existing authenticators can use
    const holder: any = {};
    const blobContext = new BlobStorageContext(holder, DEFAULT_CONTEXT_PATH);
    blobContext.startTime = dfsCtx.startTime;
    blobContext.contextId = dfsCtx.requestId;
    blobContext.account = dfsCtx.account;
    blobContext.container = dfsCtx.filesystem;
    blobContext.blob = dfsCtx.path;
    blobContext.authenticationPath = dfsCtx.authenticationPath;
    blobContext.loose = true; // DFS operations use loose mode for SAS validation

    // Set the blob operation for SAS permission checking
    blobContext.operation = mapDfsOperationToBlobOperation(dfsCtx.operation);

    const request = new ExpressRequestAdapter(req);

    try {
      let pass = false;
      for (const authenticator of authenticators) {
        const result = await authenticator.validate(request, blobContext);
        if (result === true) {
          pass = true;
          break;
        }
      }

      if (!pass) {
        const hasAuth = req.header("authorization") !== undefined;
        const hasSas = req.query.sig !== undefined;
        if (!hasAuth && !hasSas && oauth === undefined) {
          // No credentials and no OAuth requirement — pass through (emulator dev mode)
          return next();
        }

        sendDfsError(res, {
          statusCode: 403,
          code: "AuthorizationFailure",
          message: "Server failed to authenticate the request."
        });
        return;
      }

      // When ACL mode is enabled, extract identity from bearer token
      // so ACL enforcement can check permissions downstream
      if (oauth === OAuthLevel.ACL) {
        dfsCtx.identity = extractIdentityFromRequest(req);
      }

      next();
    } catch (error: any) {
      if (error.statusCode) {
        sendDfsError(res, {
          statusCode: error.statusCode,
          code: error.storageErrorCode || "AuthenticationFailed",
          message: error.storageErrorMessage || error.message
        });
      } else {
        next(error);
      }
    }
  };
}
