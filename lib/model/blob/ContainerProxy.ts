'use strict';

import crypto from 'crypto';
import { computeEtag as etag } from './../../core/utils';
import StorageEntityProxy from './StorageEntityProxy';


/**
 * Serves as a container proxy to the corresponding LokiJS object. 
 * 
 * @class ContainerProxy
 */
class ContainerProxy extends StorageEntityProxy {
    constructor(original) {
        super(original);
    }

    /**
     * Updates and returns the strong ETag of the underlying container. 
     * 
     * @returns 
     * @memberof ContainerProxy
     */
    updateETag() {
        const etagValue = etag(`${this.lastModified()}${JSON.stringify(this.original.metaProps)}${this.original.name}${this.original.meta.revision}`);
        this.original.etag = `${etagValue}`;
        return this.original.etag;
    }
}

export default ContainerProxy;