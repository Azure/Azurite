'use strict';

const crypto = require('crypto'),
    EntityType = require('./../Constants').StorageEntityType,
    AzuriteRequest = require('./AzuriteRequest'),
    InternalAzuriteError = require('./../InternalAzuriteError');

let _md5 = null;

class AzuriteBlobRequest extends AzuriteRequest {
    constructor({
        containerName = '',
        blobName = '',
        httpHeaders = {},
        rawHeaders = [],
        body = null,
        entityType = EntityType.BlockBlob,
        blockId = null }) {

        super(httpHeaders, rawHeaders, entityType);
        this.containerName = containerName;
        this.blobName = blobName;
        this.body = body;
        this.blockId = blockId;
        this.isSnapshot = false;
    }

    calculateContentMd5() {
        if (!this.body) {
            throw new InternalAzuriteError('Request: MD5 calculation without initialized body.');
        }
        if (!_md5) {
            _md5 = crypto.createHash('md5')
                .update(this.body)
                .digest('base64');
        }
        return _md5;
    }

    setSnapshotDate(date) {
        this.snapshotDate = date;
        this.snapshot = true;
    }

     /**
     * Checks whether blob name corresponds to a virtual directory. This is true if the name ends with at least trailing slash.
     * 
     * @returns true if name is followed by at least one '/' character, false otherwise.  
     * 
     * @memberof Blob
     */
    isVirtualDirectory() {
        return this.name.match('.*\/+$') !== null;
    }

    isSnapshot() {
        return this.snapshot;
    }

    /**
     * The name of the blob that is used in the web and disk interface. 
     * 
     * @returns 
     * 
     * @memberof Blob
     */
    publicName() {
        if (this.isSnapshot()) {
            return `${this.name}-${Date.parse(this.snapshotDate)}`;
        }
        if (this.isVirtualDirectory()) {
            return Buffer.from(this.name, 'utf8').toString('base64');
        }
        return this.name;
    }
}

module.exports = AzuriteBlobRequest;