'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { LeaseActions as LeaseAction } from './../../core/Constants';
import { LeaseStatus } from './../../core/Constants';
import BlobRequest from './../../model/blob/AzuriteBlobRequest';
import { ErrorCodes } from '../../core/AzuriteError';

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
            throw ErrorCodes.InvalidHeaderValue;
        }

        proxy.updateLeaseState();

        switch (proxy.original.leaseState) {
            case LeaseStatus.AVAILABLE:
                if (leaseAction === LeaseAction.RELEASE) {
                    throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                }
                if (leaseAction !== LeaseAction.ACQUIRE) {
                    throw ErrorCodes.LeaseNotPresentWithLeaseOperation;
                }
                break;
            case LeaseStatus.LEASED:
                if (leaseAction === LeaseAction.ACQUIRE && leaseId !== proxy.original.leaseId) {
                    throw ErrorCodes.LeaseAlreadyPresent;
                }
                if (leaseAction === LeaseAction.CHANGE) {
                    if (request.httpProps[N.PROPOSED_LEASE_ID] === undefined) {
                        throw ErrorCodes.MissingRequiredHeader;
                    }
                    if (request.httpProps[N.PROPOSED_LEASE_ID] !== proxy.original.leaseId && request.httpProps[N.LEASE_ID] !== proxy.original.leaseId) {
                        throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                    }
                }
                if ([LeaseAction.RENEW, LeaseAction.RELEASE].includes(leaseAction) &&
                    leaseId !== proxy.original.leaseId) {
                    throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                }
                break;
            case LeaseStatus.EXPIRED:
                if (leaseAction === LeaseAction.CHANGE) {
                    throw ErrorCodes.LeaseNotPresentWithLeaseOperation;
                    // This is the only validation check specific to Blobs
                } else if (leaseAction === LeaseAction.RENEW && request instanceof BlobRequest && leaseId === proxy.original.leaseId && proxy.original.leaseETag !== proxy.original.etag) {
                    throw ErrorCodes.LeaseNotPresentWithLeaseOperation;
                }
                else if ((leaseAction === LeaseAction.RENEW || leaseAction === LeaseAction.RELEASE) &&
                    leaseId !== proxy.original.leaseId) {
                    throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                }
                break;
            case LeaseStatus.BREAKING:
                if (leaseId === proxy.original.leaseId) {
                    if (leaseAction === LeaseAction.ACQUIRE) {
                        throw ErrorCodes.LeaseIsBreakingAndCannotBeAcquired;
                    }
                    if (leaseAction === LeaseAction.CHANGE) {
                        throw ErrorCodes.LeaseIsBreakingAndCannotBeChanged;
                    }
                } else {
                    if (leaseAction === LeaseAction.RELEASE) {
                        throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                    }
                    if (leaseAction === LeaseAction.CHANGE) {
                        throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                    }
                    if (leaseAction === LeaseAction.ACQUIRE ||
                        leaseAction === LeaseAction.RENEW) {
                        throw ErrorCodes.LeaseAlreadyPresent;
                    }
                }
                break;
            case LeaseStatus.BROKEN:
                if (leaseAction === LeaseAction.RENEW) {
                    throw ErrorCodes.LeaseIsBrokenAndCannotBeRenewed;
                }
                if (leaseAction === LeaseAction.CHANGE) {
                    throw ErrorCodes.LeaseNotPresentWithLeaseOperation;
                }
                if (leaseAction === LeaseAction.RELEASE && leaseId !== proxy.original.leaseId) {
                    throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                }
                break;
        }
    }
}

export default new LeaseActions();