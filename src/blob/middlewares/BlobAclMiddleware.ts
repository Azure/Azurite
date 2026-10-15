import { NextFunction, Request, RequestHandler, Response } from "express";

import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import { OAuthLevel } from "../../common/models";
import BlobTokenAuthenticator from "../authentication/BlobTokenAuthenticator";
import BlobStorageContext from "../context/BlobStorageContext";
import DfsAclAuthorizer, { PathAccess } from "../dfs/DfsAclAuthorizer";
import { extractBearerIdentity, isBearerAuthorization } from "../dfs/DfsAuthenticationMiddleware";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import Operation from "../generated/artifacts/operation";
import ExpressRequestAdapter from "../generated/ExpressRequestAdapter";
import IRequest from "../generated/IRequest";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { DEFAULT_CONTEXT_PATH } from "../utils/constants";
import { isHierarchicalNamespaceContainer } from "../utils/utils";

/**
 * The access each Blob API operation needs to its blob, for the ACL checks.
 * Operations not listed aren't subject to ACLs.
 */
const OPERATION_ACCESS: Map<Operation, PathAccess> = new Map<Operation, PathAccess>([
  [Operation.Blob_Download, "read"],
  [Operation.Blob_GetProperties, "read"],
  [Operation.Blob_GetTags, "read"],
  [Operation.Blob_Query, "read"],
  [Operation.BlockBlob_GetBlockList, "read"],
  [Operation.PageBlob_GetPageRanges, "read"],
  [Operation.PageBlob_GetPageRangesDiff, "read"],
  [Operation.BlockBlob_Upload, "write"],
  [Operation.BlockBlob_PutBlobFromUrl, "write"],
  [Operation.BlockBlob_StageBlock, "write"],
  [Operation.BlockBlob_StageBlockFromURL, "write"],
  [Operation.BlockBlob_CommitBlockList, "write"],
  [Operation.AppendBlob_Create, "write"],
  [Operation.AppendBlob_AppendBlock, "write"],
  [Operation.AppendBlob_AppendBlockFromUrl, "write"],
  [Operation.AppendBlob_Seal, "write"],
  [Operation.PageBlob_Create, "write"],
  [Operation.PageBlob_UploadPages, "write"],
  [Operation.PageBlob_UploadPagesFromURL, "write"],
  [Operation.PageBlob_ClearPages, "write"],
  [Operation.PageBlob_Resize, "write"],
  [Operation.PageBlob_UpdateSequenceNumber, "write"],
  [Operation.Blob_SetMetadata, "write"],
  [Operation.Blob_SetHTTPHeaders, "write"],
  [Operation.Blob_SetTags, "write"],
  [Operation.Blob_SetTier, "write"],
  [Operation.Blob_StartCopyFromURL, "write"],
  [Operation.Blob_CopyFromURL, "write"],
  [Operation.Blob_AcquireLease, "write"],
  [Operation.Blob_ReleaseLease, "write"],
  [Operation.Blob_RenewLease, "write"],
  [Operation.Blob_ChangeLease, "write"],
  [Operation.Blob_BreakLease, "write"],
  [Operation.Blob_Delete, "delete"]
]);

/**
 * In --oauth acl mode, authorizes a Blob API request authenticated with a
 * Bearer token on a hierarchical namespace container against the POSIX ACLs
 * of its blob. Resolves when the request is allowed or not subject to ACLs,
 * and rejects with 403 AuthorizationPermissionMismatch otherwise. Used for
 * requests and for the subrequests of batches.
 *
 * @export
 * The Bearer token is authenticated (issuer, audience, lifetime) before its
 * identity is used, as the request may have been accepted by another
 * authenticator, e.g. with a SAS: a token that isn't valid fails the request.
 *
 * @param {IBlobMetadataStore} metadataStore
 * @param {IAccountDataStore} accountDataStore
 * @param {ILogger} logger
 * @param {(OAuthLevel | undefined)} oauth
 * @param {boolean} enableHierarchicalNamespace Whether the server enables the hierarchical namespace.
 * @param {IRequest} request The request.
 * @param {BlobStorageContext} context The context of the request, with its operation.
 * @returns {Promise<void>}
 */
export async function authorizeBlobAclRequest(
  metadataStore: IBlobMetadataStore,
  accountDataStore: IAccountDataStore,
  logger: ILogger,
  oauth: OAuthLevel | undefined,
  enableHierarchicalNamespace: boolean,
  request: IRequest,
  context: BlobStorageContext
): Promise<void> {
  const authorization = request.getHeader("authorization");
  if (oauth !== OAuthLevel.ACL || !isBearerAuthorization(authorization)) {
    return;
  }

  const access = context.operation !== undefined ? OPERATION_ACCESS.get(context.operation) : undefined;
  const { account, container, blob } = context;
  if (access === undefined || !account || !container || !blob) {
    return;
  }

  let containerMetadata: { [key: string]: string } | undefined;
  try {
    containerMetadata = (await metadataStore.getContainerProperties(context, account, container)).metadata;
  } catch (error: any) {
    // A missing container is reported by the operation
    if (error?.statusCode === 404) {
      return;
    }
    throw error;
  }
  if (!isHierarchicalNamespaceContainer(containerMetadata, enableHierarchicalNamespace)) {
    return;
  }

  // Only the identity of a valid token is used
  const tokenValid = await new BlobTokenAuthenticator(accountDataStore, oauth, logger)
    .validate(request, context);
  if (tokenValid !== true) {
    throw StorageErrorFactory.getAuthorizationFailure(context.contextId!);
  }

  // A token accepted without readable claims gets an empty identity, so ACL
  // checks fail closed
  const identity = extractBearerIdentity(authorization) ?? {};
  const result = await new DfsAclAuthorizer(metadataStore).authorize(
    identity, account, container, blob, access, context.contextId
  );
  if (!result.allowed) {
    throw StorageErrorFactory.getAuthorizationPermissionMismatch(context.contextId!);
  }
}

/**
 * In --oauth acl mode, applies the POSIX ACLs of DFS paths to the Blob API
 * requests authenticated with a Bearer token on hierarchical namespace
 * containers, so that the Blob API can't bypass them. Like with the DFS
 * endpoint, the identity of a Bearer request is evaluated even when the
 * request also carries a SAS, and requests authenticated with Shared Key or a
 * SAS alone aren't subject to ACLs.
 *
 * @param {IBlobMetadataStore} metadataStore
 * @param {IAccountDataStore} accountDataStore
 * @param {ILogger} logger
 * @param {OAuthLevel} [oauth]
 * @param {boolean} enableHierarchicalNamespace Whether the server enables the hierarchical namespace.
 * @returns {RequestHandler}
 */
export default function createBlobAclMiddleware(
  metadataStore: IBlobMetadataStore,
  accountDataStore: IAccountDataStore,
  logger: ILogger,
  oauth: OAuthLevel | undefined,
  enableHierarchicalNamespace: boolean
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    authorizeBlobAclRequest(
      metadataStore,
      accountDataStore,
      logger,
      oauth,
      enableHierarchicalNamespace,
      new ExpressRequestAdapter(req),
      new BlobStorageContext(res.locals, DEFAULT_CONTEXT_PATH)
    ).then(() => next(), next);
  };
}
