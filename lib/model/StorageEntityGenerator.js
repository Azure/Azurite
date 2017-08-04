'use strict';

const EntityType = require('./../Constants').StorageEntityType,
    etag = require('./../utils');

/**
 * Generates an according Storage Entity (@type Container or @type Blob) out of a @ref AzuriteRequest object.
 * 
 * @class StorageEntityGenerator
 */
class StorageEntityGenerator {
    constructor() {
    }

    /**
     * Generates a persistable storage entity respresentation based on a @type AzuriteRequest object
     * 
     * @returns 
     * @memberof StorageEntityGenerator
     */
    generateStorageEntity(request) {
        const o = {};
        o.metaProps = request.metaProps;
        o.entityType = request.entityType;

        if (request.entityType === EntityType.Container) {
            o.name = request.containerName;
        }
        // Common to all blobs
        if (request.entityType === EntityType.AppendBlob || request.entityType === EntityType.BlockBlob || request.entityType === EntityType.PageBlob) {
            o.name = request.blobName;
            snapshot = false;
            committed = true;
            leaseState = 'available';
            md5 = request.calculateContentMd5();
            // x-ms-blob-content-length is set only for page blobs
            size = request.httpProps[N.BLOB_CONTENT_LENGTH] || body ? body.length : 0;
            o.etag = etag(`${Date.parse(new Date())}${JSON.stringify(o.metaProps)}${request.blobName}${request.containerName}`);
        }
        // Specific to Append Blobs
        if (request.entityType === EntityType.AppendBlob) {
            o[N.BLOB_COMMITTED_BLOCK_COUNT] = 0;
        }
        // Specific to Block Blobs that are potentially part of a commit
        if (request.entityType === EntityType.BlockBlob && request.blockId !== null) {
            o.blockId = request.blockId;
            o.parent = `${request.containerName}-${request.blobName}`;
            o.name = `${o.parent}-${o.blockId}`;
        }
        // Specific to Page Blobs
        if (request.entityType === EntityType.PageBlob) {
            // Nothing specific so far...
        }
    }
}

module.exports = new StorageEntityGenerator();