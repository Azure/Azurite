'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class BlobLeaseUsage {
    constructor() {
    }

    /**
     * Checks whether intended lease usage operation is semantically valid as specified
     * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
     * 
     * @param {any} options.blob 
     * @param {string} options.leaseId 
     * @param {string} options.usage either 'write' or 'read' 
     * @memberof LeaseActions
     */
    validate(options) {
        const leaseId = options.leaseId,
            usage = options.usage,
            blob = options.blob;

        blob.leaseState = this._updateLeaseState(blob.leaseState, blob.leaseExpiredAt, blob.leaseBrokenAt);

        switch (blob.leaseState) {
            case 'available':
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithBlobOperation);
                }
                break;
            case 'leased':
                if (usage === 'write' && leaseId === undefined) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === 'write' && leaseId !== blob.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                if (usage === 'read' && leaseId !== blob.leaseId && leaseId !== undefined) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case 'breaking':
                if (usage === 'write' && leaseId === undefined) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === 'write' && leaseId !== blob.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithBlobOperation);
                }
                if (usage === 'read' && leaseId !== undefined && leaseId !== blob.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case 'broken':
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithBlobOperation);
                }
                break;
            case 'expired':
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithBlobOperation);
                }
                break;
        }
    }

    // Fixme: This is redundantly defined in StorageManager! Needs to be refactored into Blob model
    _updateLeaseState(leaseState, leaseExpiredAt, leaseBrokenAt) {
        const now = Date.now();
        switch (leaseState) {
            // Has breaking period expired?
            case 'breaking':
                return (leaseBrokenAt <= now) ? 'broken' : 'breaking';
            // Has lease expired?
            case 'leased':
                // Infinite Lease
                if (leaseExpiredAt === -1) {
                    return 'leased';
                }
                return (leaseExpiredAt <= now) ? 'expired' : 'leased';
            default:
                return leaseState || 'available';
        }
    }
}

module.exports = new BlobLeaseUsage();