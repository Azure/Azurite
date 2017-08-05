'use strict';

const EntityType = require('./../Constants').StorageEntityType,
    N = require('./HttpHeaderNames'),
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
        const entity = {};
        
        // Common to all entities (containers and blobs)
        entity.metaProps = request.metaProps;
        entity.entityType = request.entityType;
        entity.leaseState = 'available';

        if (request.entityType === EntityType.Container) {
            entity.name = request.containerName;
            entity.access = request.httpProps[N.BLOB_PUBLIC_ACCESS];
            entity.etag = etag(`${Date.parse(new Date())}${JSON.stringify(entity.metaProps)}${request.containerName}`);
        }
        // Common to all blobs
        if (request.entityType === EntityType.AppendBlob || request.entityType === EntityType.BlockBlob || request.entityType === EntityType.PageBlob) {
            entity.name = request.blobName;
            entity.snapshot = false;
            entity.committed = true;
            entity.md5 = request.calculateContentMd5();
            // x-ms-blob-content-length is set only for page blobs
            entity.size = request.httpProps[N.BLOB_CONTENT_LENGTH] || body ? body.length : 0;
            entity.etag = etag(`${Date.parse(new Date())}${JSON.stringify(entity.metaProps)}${request.blobName}${request.containerName}`);
        }
        // Specific to Append Blobs
        if (request.entityType === EntityType.AppendBlob) {
            entity[N.BLOB_COMMITTED_BLOCK_COUNT] = 0;
        }
        // Specific to Block Blobs that are potentially part of a commit
        if (request.entityType === EntityType.BlockBlob && request.blockId !== null) {
            entity.blockId = request.blockId;
            entity.parent = `${request.containerName}-${request.blobName}`;
            entity.name = `${entity.parent}-${entity.blockId}`;
        }
        // Specific to Page Blobs
        if (request.entityType === EntityType.PageBlob) {
            // Nothing specific so far...
        }
    }
}

module.exports = new StorageEntityGenerator();