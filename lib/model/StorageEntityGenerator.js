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
        entity.access = 'private';

        if (request.entityType === EntityType.Container) {
            entity.name = request.containerName;
            entity.access = request.httpProps[N.BLOB_PUBLIC_ACCESS];
            entity.etag = etag(`${Date.parse(new Date())}${JSON.stringify(entity.metaProps)}${request.containerName}`);
        } else {
            // Common to all blobs
            entity.name = request.blobName;
            entity.snapshot = false;
            entity.committed = true;
            entity.md5 = request.calculateContentMd5();
            entity.size = request.body ? request.body.length : 0;
            entity.etag = etag(`${Date.parse(new Date())}${JSON.stringify(entity.metaProps)}${request.blobName}${request.containerName}`);
            // The following attributes are deleted if they are undefined
            entity.cacheControl = request.httpProps[N.CACHE_CONTROL]; entity.cacheControl === undefined ? delete entity.cacheControl : (() => {/*NOOP*/ });
            entity.contentType = request.httpProps[N.CONTENT_TYPE]; entity.contentType === undefined ? delete entity.contentType : (() => {/*NOOP*/ });
            entity.contentEncoding = request.httpProps[N.CONTENT_ENCODING]; entity.contentEncoding === undefined ? delete entity.contentEncoding : (() => {/*NOOP*/ });
            entity.contentLanguage = request.httpProps[N.CONTENT_LANGUAGE]; entity.contentLanguage === undefined ? delete entity.contentLanguage : (() => {/*NOOP*/ });
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
            entity.size = request.httpProps[N.BLOB_CONTENT_LENGTH];
            entity.sequenceNumber = 0;
        }
    }
}

module.exports = new StorageEntityGenerator();