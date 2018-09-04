/** @format */

"use strict";

import AError from "./../../core/AzuriteError";
import N from "./../../core/HttpHeaderNames";
import { LeaseStatus } from "./../../core/Constants";
import * as Constants from "../../core/Constants";
import BlobRequest from "./../../model/blob/AzuriteBlobRequest";
import ErrorCodes from "./../../core/ErrorCodes";

/**
 * Checks whether intended lease operation is semantically valid as specified
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
 *
 * @class LeaseActions
 */
class LeaseActions {
  constructor() {}

  validate({
    request = undefined,
    containerProxy = undefined,
    blobProxy = undefined,
  }) {
    const leaseAction = request.httpProps[N.LEASE_ACTION],
      leaseId =
        request.httpProps[N.LEASE_ID] || request.httpProps[N.PROPOSED_LEASE_ID],
      proxy = request instanceof BlobRequest ? blobProxy : containerProxy;

    if (
      ![
        Constants.LeaseActions.ACQUIRE,
        Constants.LeaseActions.RENEW,
        Constants.LeaseActions.CHANGE,
        Constants.LeaseActions.RELEASE,
        Constants.LeaseActions.BREAK,
      ].includes(leaseAction)
    ) {
      throw new AError(ErrorCodes.InvalidHeaderValue);
    }

    proxy.updateLeaseState();

    switch (proxy.original.leaseState) {
      case LeaseStatus.AVAILABLE:
        if (leaseAction === Constants.LeaseActions.RELEASE) {
          throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        if (leaseAction !== Constants.LeaseActions.ACQUIRE) {
          throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
        }
        break;
      case LeaseStatus.LEASED:
        if (
          leaseAction === Constants.LeaseActions.ACQUIRE &&
          leaseId !== proxy.original.leaseId
        ) {
          throw new AError(ErrorCodes.LeaseAlreadyPresent);
        }
        if (leaseAction === Constants.LeaseActions.CHANGE) {
          if (request.httpProps[N.PROPOSED_LEASE_ID] === undefined) {
            throw new AError(ErrorCodes.MissingRequiredHeader);
          }
          if (
            request.httpProps[N.PROPOSED_LEASE_ID] !== proxy.original.leaseId &&
            request.httpProps[N.LEASE_ID] !== proxy.original.leaseId
          ) {
            throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
          }
        }
        if (
          [
            Constants.LeaseActions.RENEW,
            Constants.LeaseActions.RELEASE,
          ].includes(leaseAction) &&
          leaseId !== proxy.original.leaseId
        ) {
          throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
      case LeaseStatus.EXPIRED:
        if (leaseAction === Constants.LeaseActions.CHANGE) {
          throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
          // This is the only validation check specific to Blobs
        } else if (
          leaseAction === Constants.LeaseActions.RENEW &&
          request instanceof BlobRequest &&
          leaseId === proxy.original.leaseId &&
          proxy.original.leaseETag !== proxy.original.etag
        ) {
          throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
        } else if (
          (leaseAction === Constants.LeaseActions.RENEW ||
            leaseAction === Constants.LeaseActions.RELEASE) &&
          leaseId !== proxy.original.leaseId
        ) {
          throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
      case LeaseStatus.BREAKING:
        if (leaseId === proxy.original.leaseId) {
          if (leaseAction === Constants.LeaseActions.ACQUIRE) {
            throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeAcquired);
          }
          if (leaseAction === Constants.LeaseActions.CHANGE) {
            throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeChanged);
          }
        } else {
          if (leaseAction === Constants.LeaseActions.RELEASE) {
            throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
          }
          if (leaseAction === Constants.LeaseActions.CHANGE) {
            throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
          }
          if (
            leaseAction === Constants.LeaseActions.ACQUIRE ||
            leaseAction === Constants.LeaseActions.RENEW
          ) {
            throw new AError(ErrorCodes.LeaseAlreadyPresent);
          }
        }
        break;
      case LeaseStatus.BROKEN:
        if (leaseAction === Constants.LeaseActions.RENEW) {
          throw new AError(ErrorCodes.LeaseIsBrokenAndCannotBeRenewed);
        }
        if (leaseAction === Constants.LeaseActions.CHANGE) {
          throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
        }
        if (
          leaseAction === Constants.LeaseActions.RELEASE &&
          leaseId !== proxy.original.leaseId
        ) {
          throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
    }
  }
}

export default new LeaseActions();
