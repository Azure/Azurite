'use strict';

const AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes');

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
            throw new AError(ErrorCodes.AuthenticationFailed);
        }

        const operation = moduleOptions.sasOperation,
            accessPolicy = request.auth.accessPolicy,
            resource = accessPolicy.ResourceTypes;

        let start = undefined,
            expiry = undefined,
            permissions = undefined;

        if (request.auth.accessPolicy.Id !== undefined) {
            const si = (containerProxy.original.signedIdentifiers !== undefined)
                ? containerProxy.original.signedIdentifiers.filter((i) => {
                    return i.Id === request.auth.accessPolicy.Id;
                })[0]
                : undefined;
            if (si === undefined) {
                throw new AError(ErrorCodes.AuthenticationFailed);
            }
            start = Date.parse(si.AccessPolicy.Start);
            expiry = Date.parse(si.AccessPolicy.Expiry);
            permissions = si.AccessPolicy.Permission;
        } else {
            start = Date.parse(accessPolicy.Start); // Possibly NaN
            expiry = Date.parse(accessPolicy.Expiry); // Possibly NaN
            permissions = accessPolicy.Permissions;
        }

        // Time Validation
        if (isNaN(start) || isNaN(expiry) || now < start || now > expiry) {
            throw new AError(ErrorCodes.AuthenticationFailed);
        }

        // Permission Validation 
        if (!permissions.includes(operation)) {
            throw new AError(ErrorCodes.AuthorizationPermissionMismatch);
        }

        // Resource Validation
        if (resource !== undefined &&
            (resource === 'b' && blobProxy === undefined) ||
            (resource === 'c' && blobProxy !== undefined)) {
            throw new AError(ErrorCodes.AuthorizationResourceTypeMismatch);
        }
    }
}

module.exports = new ServiceSignature();