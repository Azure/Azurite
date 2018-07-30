import AzuriteError from "../../core/AzuriteError";
import * as Constants from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";
import AzuriteBlobRequest from "../../model/blob/AzuriteBlobRequest";
import N from "./../../core/HttpHeaderNames";

/**
 * Checks whether intended lease operation is semantically valid as specified
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
 *
 * @class LeaseActions
 */
class LeaseActions {
  public validate(request, containerProxy, blobProxy) {
    const leaseAction = request.httpProps[N.LEASE_ACTION];
    const leaseId =
      request.httpProps[N.LEASE_ID] || request.httpProps[N.PROPOSED_LEASE_ID];
    const proxy =
      request instanceof AzuriteBlobRequest ? blobProxy : containerProxy;

    if (
      ![
        Constants.LeaseActions.ACQUIRE,
        Constants.LeaseActions.RENEW,
        Constants.LeaseActions.CHANGE,
        Constants.LeaseActions.RELEASE,
        Constants.LeaseActions.BREAK
      ].includes(leaseAction)
    ) {
      throw new AzuriteBlobRequest(ErrorCodes.InvalidHeaderValue);
    }

    proxy.updateLeaseState();

    switch (proxy.original.leaseState) {
      case Constants.LeaseStatus.AVAILABLE:
        if (leaseAction === Constants.LeaseActions.RELEASE) {
          throw new AzuriteBlobRequest(
            ErrorCodes.LeaseIdMismatchWithLeaseOperation
          );
        }
        if (leaseAction !== Constants.LeaseActions.ACQUIRE) {
          throw new AzuriteBlobRequest(
            ErrorCodes.LeaseNotPresentWithLeaseOperation
          );
        }
        break;
      case Constants.LeaseStatus.LEASED:
        if (
          leaseAction === Constants.LeaseActions.ACQUIRE &&
          leaseId !== proxy.original.leaseId
        ) {
          throw new AzuriteBlobRequest(ErrorCodes.LeaseAlreadyPresent);
        }
        if (leaseAction === Constants.LeaseActions.CHANGE) {
          if (request.httpProps[N.PROPOSED_LEASE_ID] === undefined) {
            throw new AzuriteBlobRequest(ErrorCodes.MissingRequiredHeader);
          }
          if (
            request.httpProps[N.PROPOSED_LEASE_ID] !== proxy.original.leaseId &&
            request.httpProps[N.LEASE_ID] !== proxy.original.leaseId
          ) {
            throw new AzuriteError(
              ErrorCodes.LeaseIdMismatchWithLeaseOperation
            );
          }
        }
        if (
          [
            Constants.LeaseActions.RENEW,
            Constants.LeaseActions.RELEASE
          ].includes(leaseAction) &&
          leaseId !== proxy.original.leaseId
        ) {
          throw new AzuriteError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
      case Constants.LeaseStatus.EXPIRED:
        if (leaseAction === Constants.LeaseActions.CHANGE) {
          throw new AzuriteError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
          // This is the only validation check specific to Blobs
        } else if (
          leaseAction === Constants.LeaseActions.RENEW &&
          request instanceof AzuriteBlobRequest &&
          leaseId === proxy.original.leaseId &&
          proxy.original.leaseETag !== proxy.original.etag
        ) {
          throw new AzuriteError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
        } else if (
          (leaseAction === Constants.LeaseActions.RENEW ||
            leaseAction === Constants.LeaseActions.RELEASE) &&
          leaseId !== proxy.original.leaseId
        ) {
          throw new AzuriteError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
      case Constants.LeaseStatus.BREAKING:
        if (leaseId === proxy.original.leaseId) {
          if (leaseAction === Constants.LeaseActions.ACQUIRE) {
            throw new AzuriteError(
              ErrorCodes.LeaseIsBreakingAndCannotBeAcquired
            );
          }
          if (leaseAction === Constants.LeaseActions.CHANGE) {
            throw new AzuriteError(
              ErrorCodes.LeaseIsBreakingAndCannotBeChanged
            );
          }
        } else {
          if (leaseAction === Constants.LeaseActions.RELEASE) {
            throw new AzuriteError(
              ErrorCodes.LeaseIdMismatchWithLeaseOperation
            );
          }
          if (leaseAction === Constants.LeaseActions.CHANGE) {
            throw new AzuriteError(
              ErrorCodes.LeaseIdMismatchWithLeaseOperation
            );
          }
          if (
            leaseAction === Constants.LeaseActions.ACQUIRE ||
            leaseAction === Constants.LeaseActions.RENEW
          ) {
            throw new AzuriteError(ErrorCodes.LeaseAlreadyPresent);
          }
        }
        break;
      case Constants.LeaseStatus.BROKEN:
        if (leaseAction === Constants.LeaseActions.RENEW) {
          throw new AzuriteError(ErrorCodes.LeaseIsBrokenAndCannotBeRenewed);
        }
        if (leaseAction === Constants.LeaseActions.CHANGE) {
          throw new AzuriteError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
        }
        if (
          leaseAction === Constants.LeaseActions.RELEASE &&
          leaseId !== proxy.original.leaseId
        ) {
          throw new AzuriteError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
    }
  }
}

export default new LeaseActions();
