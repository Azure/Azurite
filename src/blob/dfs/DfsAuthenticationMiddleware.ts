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
import IRequest from "../generated/IRequest";

import Operation from "../generated/artifacts/operation";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { getDfsContext, IDfsAuthenticatedIdentity } from "./DfsContext";
import { DfsOperation } from "./DfsOperation";
import { sendDfsError } from "./DfsErrorFactory";
import { isPathStyleRequest, parseRenameSource } from "./DfsHeaders";
import { OAuthLevel } from "../../common/models";
import { BEARER_TOKEN_PREFIX } from "../../common/utils/constants";

const DEFAULT_CONTEXT_PATH = "dfs_blob_context";

/**
 * A request whose query parameters are replaced, e.g. by the SAS of the
 * x-ms-rename-source URL to authenticate the source of a rename.
 */
class QueryOverrideRequest implements IRequest {
  public constructor(
    private readonly request: IRequest,
    private readonly query: URLSearchParams
  ) {}

  public getMethod() { return this.request.getMethod(); }
  public getUrl() { return this.request.getUrl(); }
  public getEndpoint() { return this.request.getEndpoint(); }
  public getPath() { return this.request.getPath(); }
  public getBodyStream() { return this.request.getBodyStream(); }
  public setBody(body: string | undefined) { this.request.setBody(body); return this; }
  public getBody() { return this.request.getBody(); }
  public getHeader(field: string) { return this.request.getHeader(field); }
  public getHeaders() { return this.request.getHeaders(); }
  public getRawHeaders() { return this.request.getRawHeaders(); }
  public getQuery(key: string) { return this.query.get(key) ?? undefined; }
  public getProtocol() { return this.request.getProtocol(); }
}

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
 * Whether an Authorization header uses the Bearer scheme. Authentication
 * schemes are case-insensitive (RFC 9110). Like BlobTokenAuthenticator, any
 * value starting with the scheme name counts, so that no header accepted as a
 * token can be treated as another kind of request.
 */
export function isBearerAuthorization(authHeader: string | undefined): boolean {
  return (
    authHeader !== undefined &&
    authHeader.substring(0, BEARER_TOKEN_PREFIX.length).toLowerCase() ===
      BEARER_TOKEN_PREFIX.toLowerCase()
  );
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
  return extractBearerIdentity(req.header("authorization"));
}

/**
 * Extracts identity claims from the Bearer JWT token of an Authorization
 * header. Returns undefined if it isn't a Bearer token or can't be decoded.
 */
export function extractBearerIdentity(authHeader: string | undefined): IDfsAuthenticatedIdentity | undefined {
  if (!isBearerAuthorization(authHeader)) {
    return undefined;
  }

  const token = authHeader!.substring(BEARER_TOKEN_PREFIX.length + 1);
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
    // evaluated against the path ACLs: public access, or a SAS added to the
    // same request, would otherwise accept it without an identity.
    const isAclBearerRequest =
      oauth === OAuthLevel.ACL && isBearerAuthorization(req.header("authorization"));

    const authenticate = async (
      authRequest: IRequest,
      context: BlobStorageContext
    ): Promise<IAuthenticator | undefined> => {
      for (const authenticator of authenticators) {
        if (isAclBearerRequest && !(authenticator instanceof BlobTokenAuthenticator)) {
          continue;
        }
        if ((await authenticator.validate(authRequest, context)) === true) {
          return authenticator;
        }
      }
      return undefined;
    };

    try {
      let passedAuthenticator = await authenticate(request, blobContext);

      // A rename must also be authorized for its source, which can be in
      // another filesystem than the destination: either by the credentials of
      // the request, or by a SAS in the x-ms-rename-source URL.
      const renameSource = req.header("x-ms-rename-source");
      if (passedAuthenticator && dfsCtx.operation === DfsOperation.Path_Rename && renameSource) {
        const account = dfsCtx.account || "";
        const source = parseRenameSource(renameSource, account, isPathStyleRequest(dfsCtx, account));
        if (typeof source !== "string" &&
            (source.filesystem !== dfsCtx.filesystem || source.path !== dfsCtx.path)) {
          const sourceContext = new BlobStorageContext({}, DEFAULT_CONTEXT_PATH);
          sourceContext.startTime = dfsCtx.startTime;
          sourceContext.contextId = dfsCtx.requestId;
          sourceContext.account = dfsCtx.account;
          sourceContext.container = source.filesystem;
          sourceContext.blob = source.path;
          // Shared Key signs the URL of the request, not the source
          sourceContext.authenticationPath = dfsCtx.authenticationPath;
          sourceContext.loose = true;
          // Moving a path away from the source deletes it there
          sourceContext.operation = Operation.Blob_Delete;
          const sourceRequest = source.query.has("sig")
            ? new QueryOverrideRequest(request, source.query)
            : request;
          if (!(await authenticate(sourceRequest, sourceContext))) {
            passedAuthenticator = undefined;
          }
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
        // A token accepted without readable claims gets an empty identity, so
        // ACL checks fail closed instead of being skipped.
        dfsCtx.identity = extractIdentityFromRequest(req) ?? {};
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
