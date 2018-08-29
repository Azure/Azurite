'use strict';

import crypto from 'crypto';
import StorageEntityProxy from './StorageEntityProxy';
import { computeEtag as etag } from './../../core/utils';
import InternalAzuriteError from './../../core/InternalAzuriteError';

/**
 * Serves as a blob proxy to the corresponding LokiJS object. 
 * 
 * @class BlobProxy
 */
class BlobProxy extends StorageEntityProxy {
    constructor(original, containerName) {
        super(original);
        if (!containerName) {
            throw new InternalAzuriteError('BlobProxy: missing containerName');
        }
        this.containerName = containerName;
    }

    static createFromArray(entities, containerName) {
        let array = [];
        for (const entity of entities) {
            array.push(new BlobProxy(entity, containerName));
        }
        return array;
    }

    /**
     * Updates and returns the strong ETag of the underlying blob. 
     * 
     * @returns 
     * @memberof BlobProxy
     */
    updateETag() {
        const etagValue = etag(`${this.lastModified()}${JSON.stringify(this.original.metaProps)}${this.original.id}${this.original.meta.revision}`);
        this.original.etag = `${etagValue}`;
        return this.original.etag;
    }
}

export default BlobProxy;