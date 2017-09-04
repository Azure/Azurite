'use strict';

const AError = require('./../AzuriteError'),
    N = require('./../model/HttpHeaderNames'),
    LeaseAction = require('./../Constants').LeaseActions,
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

        if (![LeaseAction.ACQUIRE, LeaseAction.RENEW, LeaseAction.CHANGE, LeaseAction.RELEASE, LeaseAction.BREAK].includes(leaseAction)) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        switch (proxy.original.leaseState) {
            case LeaseStatus.AVAILABLE:
                if (leaseAction === LeaseAction.RELEASE) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                if (leaseAction !== LeaseAction.ACQUIRE) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                }
                break;
            case LeaseStatus.LEASED:
                if (leaseAction === LeaseAction.ACQUIRE && leaseId !== proxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseAlreadyPresent);
                }
                if (leaseAction === LeaseAction.CHANGE) {
                    if (request.httpProps[N.PROPOSED_LEASE_ID] === undefined) {
                        throw new AError(ErrorCodes.MissingRequiredHeader);
                    }
                    if (request.httpProps[N.PROPOSED_LEASE_ID] !== proxy.original.leaseId && request.httpProps[N.LEASE_ID] !== proxy.original.leaseId) {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                }
                if ([LeaseAction.RENEW, LeaseAction.RELEASE].includes(leaseAction) &&
                    leaseId !== proxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case LeaseStatus.EXPIRED:
                if (leaseAction === LeaseAction.CHANGE) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                    // This is the only validation check specific to Blobs
                } else if (leaseAction === LeaseAction.RENEW && request instanceof BlobRequest && leaseId === proxy.original.leaseId && proxy.original.leaseETag !== proxy.original.etag) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation)
                }
                else if ((leaseAction === LeaseAction.RENEW || leaseAction === LeaseAction.RELEASE) &&
                    leaseId !== proxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case LeaseStatus.BREAKING:
                if (leaseId === proxy.original.leaseId) {
                    if (leaseAction === LeaseAction.ACQUIRE) {
                        throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeAcquired);
                    }
                    if (leaseAction === LeaseAction.CHANGE) {
                        throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeChanged);
                    }
                } else {
                    if (leaseAction === LeaseAction.RELEASE) {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                    if (leaseAction === LeaseAction.CHANGE) {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                    if (leaseAction === LeaseAction.ACQUIRE ||
                        leaseAction === LeaseAction.RENEW) {
                        throw new AError(ErrorCodes.LeaseAlreadyPresent);
                    }
                }
                break;
            case LeaseStatus.BROKEN:
                if (leaseAction === LeaseAction.RENEW) {
                    throw new AError(ErrorCodes.LeaseIsBrokenAndCannotBeRenewed);
                }
                if (leaseAction === LeaseAction.CHANGE) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                }
                if (leaseAction === LeaseAction.RELEASE && leaseId !== proxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
        }
    }
}

module.exports = new LeaseActions();