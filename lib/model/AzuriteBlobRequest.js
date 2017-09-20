'use strict';

const crypto = require('crypto'),
    EntityType = require('./../Constants').StorageEntityType,
    AzuriteRequest = require('./AzuriteRequest'),
    N = require('./HttpHeaderNames'),
    env = require('./../env'),
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
    * Checks whether blob name corresponds to a virtual directory. This is true if the name ends with at least one trailing slash.
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

    snapshotName() {
        return `${this.blobName}-${Date.parse(this.snapshotDate)}`;
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
            return this.snapshotName();
        }
        if (this.isVirtualDirectory()) {
            return Buffer.from(this.blobName, 'utf8').toString('base64');
        }
        return this.blobName;
    }

    /**
     * Return the blob's URI of its external location or Azurite's internal file system location.
     * 
     * @memberof AzuriteBlobRequest
     */
    copySourceUrl() {
        // External storage account (supported since version 2015-02-21)
        if (this.httpProps[N.COPY_SOURCE === undefined]) {
            throw new InternalAzuriteError('Request: copySourceUrl was called without copy-source header set.')
        }
        const result = {};
        const source = this.httpProps[N.COPY_SOURCE];
        if (source.match('https?:\/\/')) {
            result.type = 'external';
            result.uri = source;
        } else {
            // Same (emulator) storage account
            const regex = /\/(.*)\/(.*)\/(.*)/g
            const match = regex.exec(source);
            // Due to previous validation it is guaranteed that match !== null
            if (match !== null) {
                result.type = 'internal';
                result.uri = env.diskStorageUri(request);
            }
        }
        return result;
    }
}

module.exports = AzuriteBlobRequest;