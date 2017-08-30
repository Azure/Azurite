'use strict';

const env = require('./../env'),
    EntityType = require('./../Constants').StorageEntityType,
    putBlobHandler = require('./../api/PutBlob'),
    deleteBlobHandler = require('./../api/DeleteBlob'),
    getBlobHandler = require('./../api/GetBlob'),
    putBlockHandler = require('./../api/PutBlock'),
    putBlockListHandler = require('./../api/PutBlockList'),
    putPageHandler = require('./../api/PutPage'),
    getBlockListHandler = require('./../api/GetBlockList'),
    setBlobMetadataHandler = require('./../api/SetBlobMetadata'),
    getBlobMetadataHandler = require('./../api/GetBlobMetadata'),
    setBlobPropertiesHandler = require('./../api/SetBlobProperties'),
    getBlobPropertiesHandler = require('./../api/GetBlobProperties'),
    getPageRangesHandler = require('./../api/GetPageRanges'),
    snapshotBlobHandler = require('./../api/SnapshotBlob'),
    leaseBlobHandler = require('./../api/LeaseBlob'),
    putAppendBlobHandler = require('./../api/PutAppendBlock'),
    Operations = require('./../Constants').Operations;


/*
 * Route definitions for all operation on the 'Blob' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container/*?`)
        .get((req, res) => {
            if (req.query.comp === 'blocklist') {
                req.azuriteOperation = Operations.Blob.GET_BLOCK_LIST;
                // getBlockListHandler.process(request, res);
            } else if (req.query.comp === 'metadata') {
                req.azuriteOperation = Operations.Blob.GET_BLOB_METADATA;
                // getBlobMetadataHandler.process(req, res, req.params.container, req.params[0]);
            } else if (req.query.comp === 'pagelist') {
                req.azuriteOperation = Operations.Blob.GET_PAGE_RANGES;
                // getPageRangesHandler.process(req, res, req.params.container, req.params[0]);
            }
            else {
                req.azuriteOperation = Operations.Blob.GET_BLOB;
                // getBlobHandler.process(request, res);
            }
            req.azuriteRequest = new BlobRequest({ req: req });
            next();
        })
        .head((req, res) => {
            req.azuriteOperation = Operations.Blob.GET_BLOB_PROPERTIES;
            // getBlobPropertiesHandler.process(req, res, req.params.container, req.params[0]);
            req.azuriteRequest = new BlobRequest({ req: req });
            next();
        })
        .put((req, res) => {
            if (req.query.comp === 'block') {
                req.azuriteOperation = Operations.Blob.PUT_BLOCK;
                // request.entityType = EntityType.BlockBlob;
                // putBlockHandler.process(request, res);
            } else if (req.query.comp === 'blocklist') {
                req.azuriteOperation = Operations.Blob.PUT_BLOCK_LIST;
                putBlockListHandler.process(request, res);
            } else if (req.query.comp === 'page') {
                req.azuriteOperation = Operations.Blob.PUT_PAGE;
                putPageHandler.process(req, res, req.params.container, req.params[0], req.body);
            } else if (req.query.comp === 'appendblock') {
                req.azuriteOperation = Operations.Blob.APPEND_BLOCK;
                // putAppendBlobHandler.process(request, res);
            } else if (req.query.comp === 'snapshot') {
                req.azuriteOperation = Operations.Blob.SNAPSHOT_BLOB;
                // snapshotBlobHandler.process(req, res, req.params.container, req.params[0]);
            } else if (req.query.comp === 'lease') {
                req.azuriteOperation = Operations.Blob.LEASE_BLOB;
                // leaseBlobHandler.process(req, res, req.params.container, req.params[0]);
            } else if (req.query.comp === 'metadata') {
                req.azuriteOperation = Operations.Blob.SET_BLOB_METADATA;
                // setBlobMetadataHandler.process(req, res, req.params.container, req.params[0]);
            } else if (req.query.comp === 'properties') {
                req.azuriteOperation = Operations.Blob.SET_BLOB_PROPERTIES;
                // setBlobPropertiesHandler.process(req, res, req.params.container, req.params[0]);
            } else {
                req.azuriteOperation = Operations.Blob.PUT_BLOB;
                // putBlobHandler.process(request, res);
            }
            req.azuriteRequest = new BlobRequest({ req: req });            
            next();
        })
        .delete((req, res) => {
            req.azuriteOperation = Operations.Blob.DELETE_BLOB;
            // deleteBlobHandler.process(request, res);
            req.azuriteRequest = new BlobRequest({ req: req });            
            next();
        });
}