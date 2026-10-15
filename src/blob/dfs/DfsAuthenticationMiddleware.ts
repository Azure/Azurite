import { decode } from "jsonwebtoken";
import { NextFunction, Request, RequestHandler, Response } from "express";

import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import IAuthenticator from "../authentication/IAuthenticator";
import AccountSASAuthenticator from "../authentication/AccountSASAuthenticator";
import BlobSASAuthenticator from "../authentication/BlobSASAuthenticator";
import BlobSharedKeyAuthenticator from "../authentication/BlobSharedKeyAuthenticator";
import BlobTokenAuthenticator from "../authentication/BlobTokenAuthenticator";
import PublicAccessAuthenticator from "../authentication/PublicAccessAuthenticator";
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
      // Unclassified/undefined operations must map to the MOST restrictive
      // permission (write), not a read op, so an as-yet-unclassified request
      // is never under-enforced by SAS permission checks. Such requests are
      // ultimately rejected by DfsRequestListenerFactory's final
      // UnsupportedOperation fallback anyway — this only affects what
      // permission a SAS token would need to reach that fallback.
      return Operation.BlockBlob_Upload;
  }
}

/**
 * Extracts identity claims from a Bearer JWT token.
 * Returns undefined if the token is not a Bearer token or can't be decoded.
 *
 * The claims are decoded without verifying the token signature, the same way
 * BlobTokenAuthenticator only performs basic token validation: the emulator has
 * no access to the signing keys of the issuer. ACL enforcement therefore
 * emulates the authorization behavior of ADLS Gen2 for development and testing,
 * and is not a security boundary.
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
    new PublicAccessAuthenticator(metadataStore, logger),
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

    // In ACL mode, a Bearer request must be authenticated by its token and
    // evaluated against the path ACLs, even on a container allowing public
    // access: public access would otherwise accept it without an identity.
    const isAclBearerRequest =
      oauth === OAuthLevel.ACL &&
      (req.header("authorization")?.startsWith(BEARER_TOKEN_PREFIX) ?? false);

    try {
      let passedAuthenticator: IAuthenticator | undefined;
      for (const authenticator of authenticators) {
        if (isAclBearerRequest && authenticator instanceof PublicAccessAuthenticator) {
          continue;
        }
        const result = await authenticator.validate(request, blobContext);
        if (result === true) {
          passedAuthenticator = authenticator;
          break;
        }
      }

      if (!passedAuthenticator) {
        sendDfsError(res, {
          statusCode: 403,
          code: "AuthorizationFailure",
          message: "Server failed to authenticate the request."
        });
        return;
      }

      // When ACL mode is enabled, extract the identity only when the request
      // was actually authenticated by its Bearer token. Requests authenticated
      // by SAS/SharedKey intentionally bypass ACL enforcement (no identity),
      // but the mere presence of a `sig` query parameter must not be enough to
      // skip the ACL check of a Bearer request.
      if (
        oauth === OAuthLevel.ACL &&
        passedAuthenticator instanceof BlobTokenAuthenticator
      ) {
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
