'use strict';

const crypto = require('crypto'),
    EntityType = require('./../Constants').StorageEntityType,
    AzuriteRequest = require('./AzuriteRequest'),
    InternalAzuriteError = require('./../InternalAzuriteError');

class AzuriteBlobRequest extends AzuriteRequest {
    constructor({
        req = undefined,
        entityType = undefined,
        payload = undefined }) {

        super({
            req: req,
            entityType: entityType || req.headers['x-ms-blob-type'],
            payload: payload
        });
        this.containerName = req.params.container;
        this.blobName = req.params[0];
        this.blockId = req.query.blockid;
        this.snapshot = false;
        // Per default, all (block) blobs will be set to committed by EntityGenerator 
        this.commit = true;
        // Valid values are 'committed' (default), 'uncommitted', and 'all'
        if (this.query.blocklisttype) {
            this.blockListType = this.query.blocklisttype || 'committed';
        }
        if (this.query.snapshot) {
            this.snapshotDate = this.query.snapshot
            this.snapshot = true;
        }
        if (this.blockId) {
            this.parent = `${this.containerName}-${this.blobName}`;
            this.blockName = `${this.containerName}-${this.blobName}-${this.blockId}`;
        }
    }

    static clone(request) {
        const copy = new AzuriteBlobRequest({ req: { rawHeaders: [], headers: {}, params: {}, query: {} }, entityType: request.entityType, payload: request.payload });
        Object.assign(copy, request);
        return copy;
    }

    calculateContentMd5() {
        if (!this.body) {
            throw new InternalAzuriteError('Request: MD5 calculation without initialized body.');
        }
        return crypto.createHash('md5')
            .update(this.body)
            .digest('base64');
    }

    enableSnapshot(snapshotDate) {
        this.snapshotDate = snapshotDate;
        this.snapshot = true;
    }

    /**
    * Checks whether blob name corresponds to a virtual directory. This is true if the name ends with at least trailing slash.
    * 
    * @returns true if name is followed by at least one '/' character, false otherwise.  
    * 
    * @memberof AzuriteBlobRequest
    */
    isVirtualDirectory() {
        return this.blobName.match('.*\/+$') !== null;
    }

    isSnapshot() {
        return this.snapshot;
    }

    /**
     * The name of the blob that is used in the web and disk interface. 
     * 
     * @returns 
     * 
     * @memberof AzuriteBlobRequest
     */
    publicName() {
        if (this.isSnapshot()) {
            return `${this.blobName}-${Date.parse(this.snapshotDate)}`;
        }
        if (this.isVirtualDirectory()) {
            return Buffer.from(this.blobName, 'utf8').toString('base64');
        }
        return this.blobName;
    }
}

module.exports = AzuriteBlobRequest;