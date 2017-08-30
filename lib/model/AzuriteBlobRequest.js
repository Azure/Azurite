'use strict';

const crypto = require('crypto'),
    EntityType = require('./../Constants').StorageEntityType,
    AzuriteRequest = require('./AzuriteRequest'),
    InternalAzuriteError = require('./../InternalAzuriteError');

let _md5 = null;

class AzuriteBlobRequest extends AzuriteRequest {
    constructor({
        req = null }) {

        super({
            req: req,
            entityType: req.headers['x-ms-blob-type']
        });
        this.containerName = req.params.container;
        this.blobName = req.params[0];
        this.blockId = req.params.blockId;
        this.isSnapshot = false;
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
            return `${this.blobName}-${Date.parse(this.snapshotDate)}`;
        }
        if (this.isVirtualDirectory()) {
            return Buffer.from(this.blobName, 'utf8').toString('base64');
        }
        return this.blobName;
    }
}

module.exports = AzuriteBlobRequest;