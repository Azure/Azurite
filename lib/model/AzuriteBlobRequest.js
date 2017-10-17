'use strict';

const crypto = require('crypto'),
    url = require('url'),
    EntityType = require('./../Constants').StorageEntityType,
    BlockListType = require('./../Constants').BlockListType,
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
        this.copyId = req.query.copyid;
        // Per default, all (block) blobs will be set to committed by EntityGenerator 
        this.commit = true;
        this.blockListType = this.query.blocklisttype || BlockListType.COMMITTED
        if (this.query.snapshot) {
            this.snapshotDate = new Date(this.query.snapshot).toUTCString();
            this.snapshot = true;
            this.id = env.snapshotId(this.containerName, this.blobName, this.snapshotDate);
            this.originId = env.blobId(this.containerName, this.blobName);
            this.originUri = env.diskStorageUri(this.originId);
        } else if (this.blockId) {
            this.id = env.blockId(this.containerName, this.blobName, this.blockId);
            this.parentId = env.blobId(this.containerName, this.blobName);
            this.parentUri = env.diskStorageUri(this.parentId);
        } else {
            this.id = env.blobId(this.containerName, this.blobName);
        }
        this.uri = env.diskStorageUri(this.id);
    }

    static clone(request) {
        const copy = new AzuriteBlobRequest({ req: { rawHeaders: [], headers: {}, params: {}, query: {} }, entityType: request.entityType, payload: request.payload });
        Object.assign(copy, request);
        return copy;
    }

    calculateContentMd5() {
        if (!this.body) {
            return undefined;
        }
        return crypto.createHash('md5')
            .update(this.body)
            .digest('base64');
    }

    isSnapshot() {
        return this.snapshot;
    }

    copySourceName() {
        if (this.httpProps[N.COPY_SOURCE === undefined]) {
            throw new InternalAzuriteError('Request: copySourceUrl was called without copy-source header set.')
        }
        let source = this.httpProps[N.COPY_SOURCE];
        if (source.includes('http://127.0.0.1:10000/devstoreaccount1/')) {
            source = source.replace('http://127.0.0.1:10000/devstoreaccount1/', '');
        } else { // format: /accountName/containerName/blobName
            // TODO
        }
        const parts = source.split('/'),
            containerName = parts[0];
        parts.splice(0, 1);
        const blobName = decodeURIComponent(parts.join('/')); // // unicode characters in http headers are encoded!
        const query = url.parse(blobName).query
        let date = undefined;
        if (query !== null && query !== '') {
            date = query.split('=')[1]
        }
        return {
            sourceContainerName: containerName,
            sourceBlobName: blobName,
            date: date
        };
    }
}

module.exports = AzuriteBlobRequest;