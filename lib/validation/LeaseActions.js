'use strict';

const AError = require('./../AzuriteError'),
    N = require('./../model/HttpHeaderNames'),
    LeaseActions = require('./../Constants').LeaseActions,
    LeaseStatus = require('./../Constants').LeaseStatus,
    BlobRequest = require('./../model/AzuriteBlobRequest'),
    ErrorCodes = require('./../ErrorCodes');

/**
 * Checks whether intended lease operation is semantically valid as specified
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
 * 
 * @class LeaseActions
 */
class LeaseActions {
    constructor() {
    }

    validate({ request = undefined, containerProxy = undefined, blobProxy = undefined }) {
        const leaseAction = request.httpProps[N.LEASE_ACTION],
            leaseId = request.httpProps[N.LEASE_ID] || request.httpProps[N.PROPOSED_LEASE_ID],
            proxy = (request instanceof BlobRequest) ? blobProxy : containerProxy;

        if (![LeaseActions.ACQUIRE, LeaseActions.RENEW, LeaseActions.CHANGE, LeaseActions.RELEASE, LeaseActions.BREAK].includes(leaseAction)) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        switch (proxy.original.leaseState) {
            case LeaseStatus.AVAILABLE:
                if (leaseAction === LeaseActions.RELEASE) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                if (leaseAction !== LeaseActions.ACQUIRE) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                }
                break;
            case LeaseStatus.LEASED:
                if (leaseAction === LeaseActions.ACQUIRE && leaseId !== proxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseAlreadyPresent);
                }
                if (leaseAction === LeaseActions.CHANGE) {
                    if (options.proposedLeaseId === undefined) {
                        throw new AError(ErrorCodes.MissingRequiredHeader);
                    }
                    if (options.proposedLeaseId !== proxy.original.leaseId && options.leaseId !== proxy.original.leaseId) {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                }
                if ([LeaseActions.RENEW, LeaseActions.RELEASE].includes(leaseAction) &&
                    leaseId !== proxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case LeaseStatus.EXPIRED:
                if (leaseAction === LeaseActions.CHANGE) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                    // This is the only validation check specific to Blobs
                } else if (leaseAction === LeaseActions.RENEW && request instanceof BlobRequest && leaseId === proxy.original.leaseId && proxy.original.leaseETag !== proxy.original.etag) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation)
                }
                else if ((leaseAction === LeaseActions.RENEW || leaseAction === LeaseActions.RELEASE) &&
                    leaseId !== proxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case LeaseStatus.BREAKING:
                if (leaseId === proxy.original.leaseId) {
                    if (leaseAction === LeaseActions.ACQUIRE) {
                        throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeAcquired);
                    }
                    if (leaseAction === LeaseActions.CHANGE) {
                        throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeChanged);
                    }
                } else {
                    if (leaseAction === LeaseActions.RELEASE) {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                    if (leaseAction === LeaseActions.CHANGE) {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                    if (leaseAction === LeaseActions.ACQUIRE ||
                        leaseAction === LeaseActions.RENEW) {
                        throw new AError(ErrorCodes.LeaseAlreadyPresent);
                    }
                }
                break;
            case LeaseStatus.BROKEN:
                if (leaseAction === LeaseActions.RENEW) {
                    throw new AError(ErrorCodes.LeaseIsBrokenAndCannotBeRenewed);
                }
                if (leaseAction === LeaseActions.CHANGE) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                }
                if (leaseAction === LeaseActions.RELEASE && leaseId !== proxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
        }
    }
}

module.exports = new LeaseActions();