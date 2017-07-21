'use strict';

const AError = require('./../Error'),
    Blob = require('./../model/Blob'),
    ErrorCodes = require('./../ErrorCodes');

class LeaseActions {
    constructor() {
    }

    /**
     * Checks whether intended lease operation is semantically valid as specified
     * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
     *
     * @param {any} options.storageItem
     * @param {string} options.leaseAction
     * @param {string} options.leaseId
     * @param {string} options.proposedLeaseId
     * @memberof LeaseActions
     */
    validate(options) {
        const leaseAction = options.leaseAction,
            leaseId = options.leaseId || options.proposedLeaseId,
            storageItem = options.storageItem;

        if (!['acquire', 'renew', 'change', 'release', 'break'].includes(leaseAction)) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        switch (storageItem.leaseState) {
            case 'available':
                if (leaseAction === 'release') {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                if (leaseAction !== 'acquire') {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                }
                break;
            case 'leased':
                if (leaseAction === 'acquire' && leaseId !== storageItem.leaseId) {
                    throw new AError(ErrorCodes.LeaseAlreadyPresent);
                }
                if (leaseAction === 'change') {
                    if (options.proposedLeaseId === undefined) {
                        throw new AError(ErrorCodes.MissingRequiredHeader);
                    }
                    if (options.proposedLeaseId !== storageItem.leaseId && options.leaseId !== storageItem.leaseId) {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                }
                if (['renew', 'release'].includes(leaseAction) &&
                    leaseId !== storageItem.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case 'expired':
                if (leaseAction === 'change') {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                // This is the only validation check specific to Blobs
                } else if (leaseAction === 'renew' && storageItem instanceof Blob && leaseId === storageItem.leaseId && storageItem.leaseETag !== storageItem.httpProps.ETag) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation)
                } 
                else if ((leaseAction === 'renew' || leaseAction === 'release') &&
                    leaseId !== storageItem.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case 'breaking':
                if (leaseId === storageItem.leaseId) {
                    if (leaseAction === 'acquire') {
                        throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeAcquired);
                    }
                    if (leaseAction === 'change') {
                        throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeChanged);
                    }
                } else {
                    if (leaseAction === 'release') {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                    if (leaseAction === 'change') {
                        throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                    }
                    if (leaseAction === 'acquire' ||
                        leaseAction === 'renew') {
                        throw new AError(ErrorCodes.LeaseAlreadyPresent);
                    }
                }
                break;
            case 'broken':
                if (leaseAction === 'renew') {
                    throw new AError(ErrorCodes.LeaseIsBrokenAndCannotBeRenewed);
                }
                if (leaseAction === 'change') {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                }
                if (leaseAction === 'release' && leaseId !== storageItem.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
        }
    }
}

module.exports = new LeaseActions();