'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

/**
 * Checks whether the operation is authorized by the service signature (if existing). 
 * 
 * @class ServiceSignature
 */
class ServiceSignature {
    constructor() {
    }

    validate({ request = undefined, containerProxy = undefined, blobProxy = undefined, moduleOptions = undefined }) {
        if (request.auth === undefined) {
            // NOOP: No Service Signature signature was defined in the request 
            return;
        }

        if (!request.auth.sasValid) {
            throw ErrorCodes.AuthenticationFailed;
        }

        const operation = moduleOptions.sasOperation,
            accessPolicy = request.auth.accessPolicy,
            resource = request.auth.resource;

        let start = undefined,
            expiry = undefined,
            permissions = undefined;

        if (request.auth.accessPolicy.id !== undefined) {
            const si = (containerProxy.original.signedIdentifiers !== undefined)
                ? containerProxy.original.signedIdentifiers.SignedIdentifier.filter((i) => {
                    return i.Id === request.auth.accessPolicy.id;
                })[0]
                : undefined;
            if (si === undefined) {
                throw ErrorCodes.AuthenticationFailed;
            }
            start = Date.parse(si.AccessPolicy.Start);
            expiry = Date.parse(si.AccessPolicy.Expiry);
            permissions = si.AccessPolicy.Permission;
        } else {
            start = Date.parse(accessPolicy.start); // Possibly NaN
            expiry = Date.parse(accessPolicy.expiry); // Possibly NaN
            permissions = accessPolicy.permissions;
        }

        // Time Validation
        if (isNaN(expiry) || request.now < start || request.now > expiry) {
            throw ErrorCodes.AuthenticationFailed;
        }

        // Permission Validation 
        if (!permissions.includes(operation)) {
            throw ErrorCodes.AuthorizationPermissionMismatch;
        }
    }
}

export default new ServiceSignature();