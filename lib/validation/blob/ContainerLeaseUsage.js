'use strict';

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';
import { Usage } from './../../core/Constants';
import { LeaseStatus } from './../../core/Constants';

/**
 * Checks whether intended lease usage operation is semantically valid as specified
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
 * 
 * @class ContainerLeaseUsage
 */
class ContainerLeaseUsage {
    constructor() {
    }

    validate({ request = undefined, containerProxy = undefined, moduleOptions = undefined }) {
        const leaseId = request.leaseId(),
            usage = moduleOptions.usage;

        containerProxy.updateLeaseState();

        switch (containerProxy.original.leaseState) {
            case LeaseStatus.AVAILABLE:
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
            case LeaseStatus.LEASED:
                if (usage === Usage.Delete && !leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === Usage.Delete && leaseId !== containerProxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                if (usage === Usage.Other && leaseId !== containerProxy.original.leaseId && leaseId !== undefined) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                break;
            case LeaseStatus.BREAKING:
                if (usage === Usage.Delete && leaseId !== containerProxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                if (usage === Usage.Delete && !leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === Usage.Other && leaseId !== containerProxy.original.leaseId && leaseId !== undefined) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case LeaseStatus.BROKEN:
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
            case LeaseStatus.EXPIRED:
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
        }
    }
}

export default new ContainerLeaseUsage();