'use strict';

import crypto from 'crypto';
import BbPromise from 'bluebird';
import InternalAzuriteError from './../../core/InternalAzuriteError';
import fsextra from 'fs-extra';
const fs = BbPromise.promisifyAll(fsextra);

/**
 * DO NOT INSTANTIATE.
 * Serves as the base class proxy to the corresponding LokiJS object, which could be either a container or a blob. 
 * 
 * @class StorageEntityProxy
 */
class StorageEntityProxy {
    constructor(original) {
        if (!original) {
            throw new InternalAzuriteError('StorageEntityProxy: missing original');
        }
        this.original = original;
    }

    release() {
        this.updateLeaseState();
        this.updateETag();
        return this.original;
    }

    /**
     * Updates and returns the lease state of the storage item based on its internal state.
     * Changes to the underlying LokiJS object are automatically persisted by LokiJS.
     * 
     * @returns 
     * @memberof StorageEntityProxy
     */
    updateLeaseState() {
        const now = Date.now();
        switch (this.original.leaseState) {
            // Has breaking period expired?
            case 'breaking':
                this.original.leaseState = (this.original.leaseBrokenAt <= now) ? 'broken' : 'breaking';
                break;
            // Has lease expired?
            case 'leased':
                // Infinite Lease
                if (this.original.leaseExpiredAt === -1) {
                    this.original.leaseState = 'leased';
                } else {
                    this.original.leaseState = (this.original.leaseExpiredAt <= now) ? 'expired' : 'leased';
                }
                break;
            default:
                this.original.leaseState = this.original.leaseState || 'available';
        }
        return this.original.leaseState;
    }

    updateETag() {
        throw new InternalAzuriteError('updateETag not implemented!');
    }

    /**
     * Returns the date and time the storage entity was last modified. The date format follows RFC 1123.
     * 
     * @returns 
     * @memberof StorageEntityProxy
     */
    lastModified() {
        return new Date(this.original.meta.updated || this.original.meta.created).toUTCString();
    }
}

export default StorageEntityProxy;