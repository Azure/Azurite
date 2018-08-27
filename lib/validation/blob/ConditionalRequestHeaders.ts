'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';
import { StorageEntityType as EntityType } from './../../core/Constants';
import N from './../../core/HttpHeaderNames';
import { Usage } from './../../core/Constants';

class ConditionalRequestHeaders {
    constructor() {
    }

    /** 
     * Checks whether the following conditional request headers are satisfied.
     * - If-Modified-Since
     * - If-Unmodified-Since
     * - If-Match
     * - If-None-Match
     */
    validate({ request = undefined, containerProxy = undefined, blobProxy = undefined, moduleOptions = undefined }) {
        const proxy = request.entityType === EntityType.Container ? containerProxy : blobProxy,
            ifMatchVal = request.httpProps[N.IF_MATCH],
            ifNoneMatchVal = request.httpProps[N.IF_NONE_MATCH],
            ifModifiedSinceVal = (request.httpProps[N.IF_MODFIFIED_SINCE]) ? new Date(request.httpProps[N.IF_MODFIFIED_SINCE]) : undefined,
            ifUnmodifiedSinceVal = (request.httpProps[N.IF_UNMODIFIED_SINCE]) ? new Date(request.httpProps[N.IF_UNMODIFIED_SINCE]) : undefined,
            usage = moduleOptions.usage;

        // If the storage has not been created yet, but conditional headers are specified the operation fails with 412
        if (proxy === undefined) {
            if (ifMatchVal) {
                throw ErrorCodes.ConditionNotMetWrite; // 412

            }
            return;
        }
        // If wildcard character is specified, perform the operation only if the resource does not exist, and fail the operation if it does exist.
        // Resource does not exist if there is no proxy available or if there is a proxy available but the blob has not been committed yet.
        if (ifNoneMatchVal === '*' && (blobProxy === undefined || blobProxy.original.committed === true)) {
            throw ErrorCodes.BlobAlreadyExists;
        }

        const ETagVal = `\"${proxy.original.etag}\"`,
            lastModifiedVal = new Date(proxy.lastModified()),
            ifModifiedSince = ifModifiedSinceVal < lastModifiedVal, // operation will be performed only if it has been modified since the specified time
            ifUnmodifiedSince = ifUnmodifiedSinceVal >= lastModifiedVal, // operation will be performed only if it has _not_ been modified since the specified time
            ifMatch = ifMatchVal !== undefined && (ifMatchVal === ETagVal || ifMatchVal === '*'),
            ifNoneMatch = ifNoneMatchVal !== undefined && ifNoneMatchVal !== ETagVal;

        switch (usage) {
            case Usage.Read:
                if ((ifMatchVal !== undefined && !ifMatch) ||
                    (ifUnmodifiedSinceVal !== undefined && !ifUnmodifiedSince)) {
                    throw ErrorCodes.ConditionNotMetWrite; // 412
                }

                if ((ifNoneMatchVal !== undefined && !ifNoneMatch) ||
                    (ifModifiedSinceVal && !ifModifiedSince)) {
                    throw ErrorCodes.ConditionNotMetRead; // 304
                }
                break;
            case Usage.Write:
                if (ifMatchVal !== undefined && !ifMatch ||
                    ifUnmodifiedSinceVal !== undefined && !ifUnmodifiedSince ||
                    ifNoneMatchVal !== undefined && !ifNoneMatch ||
                    ifModifiedSinceVal !== undefined && !ifModifiedSince) {
                    throw ErrorCodes.ConditionNotMetWrite; // 412
                }
                break;
        }
    }
}

export default new ConditionalRequestHeaders();