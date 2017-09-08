'use strict';

const EntityType = require('./../Constants').StorageEntityType,
    N = require('./HttpHeaderNames'),
    etag = require('./../utils').computeEtag;

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
            entity.committed = request.commit; // this is true per default
            entity.md5 = request.httpProps[N.CONTENT_MD5] || request.calculateContentMd5();
            entity.size = request.body ? request.body.length : 0;
            entity.etag = etag(`${Date.parse(new Date())}${JSON.stringify(entity.metaProps)}${request.blobName}${request.containerName}`);
            // The following attributes are deleted if they are undefined
            entity.cacheControl = request.httpProps[N.CACHE_CONTROL]; entity.cacheControl === undefined ? delete entity.cacheControl : (() => {/*NOOP*/ });
            entity.contentType = request.httpProps[N.CONTENT_TYPE]; entity.contentType === undefined ? delete entity.contentType : (() => {/*NOOP*/ });
            entity.contentEncoding = request.httpProps[N.CONTENT_ENCODING]; entity.contentEncoding === undefined ? delete entity.contentEncoding : (() => {/*NOOP*/ });
            entity.contentLanguage = request.httpProps[N.CONTENT_LANGUAGE]; entity.contentLanguage === undefined ? delete entity.contentLanguage : (() => {/*NOOP*/ });
            entity.contentDisposition = request.httpProps[N.CONTENT_DISPOSITION]; entity.contentDisposition === undefined ? delete entity.contentDisposition : (() => {/*NOOP*/ });
            entity.md5 = request.httpProps[N.CONTENT_MD5]; entity.md5 === undefined ? delete entity.md5 : (() => {/*NOOP*/ }); 
        }
        // Specific to Append Blobs
        if (request.entityType === EntityType.AppendBlob) {
            entity[N.BLOB_COMMITTED_BLOCK_COUNT] = 0;
            // According to https://docs.microsoft.com/en-us/rest/api/storageservices/append-block the MD5 hash which is
            // optionally set in Content-MD5 header is not stored with the blob, thus we delete it.
            delete entity.md5; 
        }
        // Specific to Block Blobs that are potentially part of a commit
        if (request.entityType === EntityType.BlockBlob && request.blockId !== undefined) {
            entity.blockId = request.blockId;
            entity.parent = `${request.containerName}-${request.blobName}`;
            entity.name = `${entity.parent}-${entity.blockId}`;
            entity.committed = false;
        }
        // Specific to Page Blobs
        if (request.entityType === EntityType.PageBlob) {
            entity.size = request.httpProps[N.BLOB_CONTENT_LENGTH];
            entity.sequenceNumber = 0;
            // MD5 calculation of a page blob seems to be wrong, thus deleting it for now...
            delete entity.md5; 
        }
        return entity;
    }

    clone(o) {
        const copy = {};
        copy.metaProps = o.metaProps;
        copy.entityType = o.entityType;
        copy.leaseState = o.leaseState;
        copy.access = o.access;
        copy.name = o.name;
        copy.etag = o.etag;
        if (o.entityType !== EntityType.Container) {
            copy.snapshot = o.snapshot;
            copy.committed = o.committed;
            copy.md5 = o.md5;
            copy.size = o.size;
            if (o.cacheControl) {
                copy.cacheControl = o.cacheControl;
            }
            if (o.contentType) {
                copy.contentType = o.contentType;
            }
            if (o.contentEncoding) {
                copy.contentEncoding = o.contentEncoding;
            }
            if (o.contentLanguage) {
                copy.contentLanguage = o.contentLanguage;
            }
            if (o.entityType === EntityType.AppendBlob) {
                copy[N.BLOB_COMMITTED_BLOCK_COUNT] = o[N.BLOB_COMMITTED_BLOCK_COUNT];
            }
            if (o.entityType === EntityType.BlockBlob && o.blockId !== null) {
                copy.blockId = o.blockId;
                copy.parent = o.parent;
            }
            if (o.entityType === EntityType.PageBlob) {
                copy.size = o.size
                copy.sequenceNumber = o.sequenceNumber;
            }
        }
        return copy;
    }
}

module.exports = new StorageEntityGenerator();