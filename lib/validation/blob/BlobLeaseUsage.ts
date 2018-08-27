'use strict';

import { LeaseStatus } from './../../core/Constants';
import { Usage } from './../../core/Constants';
import { ErrorCodes } from '../../core/AzuriteError';

class BlobLeaseUsage {
    constructor() {
    }

    /**
     * Checks whether intended lease usage operation is semantically valid as specified
     * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
     */
    validate({ request = undefined, blobProxy = undefined, moduleOptions = undefined }) {
        if (blobProxy === undefined) {
            return;
        }
        
        const leaseId = request.leaseId(),
            usage = moduleOptions.usage;

        blobProxy.updateLeaseState();

        switch (blobProxy.original.leaseState) {
            case LeaseStatus.AVAILABLE:
                if (leaseId) {
                    throw ErrorCodes.LeaseNotPresentWithBlobOperation;
                }
                break;
            case LeaseStatus.LEASED:
                if (usage === Usage.Write && leaseId === undefined) {
                    throw ErrorCodes.LeaseIdMissing;
                }
                if (usage === Usage.Write && leaseId !== blobProxy.original.leaseId) {
                    throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                }
                if (usage === Usage.Read && leaseId !== blobProxy.original.leaseId && leaseId !== undefined) {
                    throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                }
                break;
            case LeaseStatus.BREAKING:
                if (usage === Usage.Write && leaseId === undefined) {
                    throw ErrorCodes.LeaseIdMissing;
                }
                if (usage === Usage.Write && leaseId !== blobProxy.original.leaseId) {
                    throw ErrorCodes.LeaseIdMismatchWithBlobOperation;
                }
                if (usage === Usage.Read && leaseId !== undefined && leaseId !== blobProxy.original.leaseId) {
                    throw ErrorCodes.LeaseIdMismatchWithLeaseOperation;
                }
                break;
            case LeaseStatus.BROKEN:
                if (leaseId) {
                    throw ErrorCodes.LeaseNotPresentWithBlobOperation;
                }
                break;
            case LeaseStatus.EXPIRED:
                if (leaseId) {
                    throw ErrorCodes.LeaseNotPresentWithBlobOperation;
                }
                break;
        }
    }
}

export default new BlobLeaseUsage();