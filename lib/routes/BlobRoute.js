'use strict';

const env = require('./../env'),
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
    putAppendBlobHandler = require('./../api/PutAppendBlock');

/*
 * Route definitions for all operation on the 'Blob' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container/*?`)
        .get((req, res) => {
            const request = new BlobRequest({
                req: req,
                usage: Usage.Read // This will be deprecated if validation is moved to dedicated middleware module
            });
            if (req.query.comp === 'blocklist') {
                // GET BLockList
                getBlockListHandler.process(req, res, req.params.container, req.params[0]);
            } else if (req.query.comp === 'metadata') {
                // GET Blob Metadata
                getBlobMetadataHandler.process(req, res, req.params.container, req.params[0]);
            } else if (req.query.comp === 'pagelist') {
                getPageRangesHandler.process(req, res, req.params.container, req.params[0]);
            }
            else {
                // GET Blob
                getBlobHandler.process(request, res);
            }
        })
        .head((req, res) => {
            // Get Blob Properties
            getBlobPropertiesHandler.process(req, res, req.params.container, req.params[0]);
        })
        .put((req, res) => {
            const request = new BlobRequest({
                req: req,
                entityType: req.headers['x-ms-blob-type'],
                usage: Usage.Write // This will be deprecated if validation is moved to dedicated middleware module
            });
            if (req.query.comp === 'block') {
                putBlockHandler.process(req, res, req.params.container, req.params[0], req.query.blockid);
            } else if (req.query.comp === 'blocklist') {
                putBlockListHandler.process(req, res, req.params.container, req.params[0], req.body);
            } else if (req.query.comp === 'page') {
                putPageHandler.process(req, res, req.params.container, req.params[0], req.body);
            } else if (req.query.comp === 'appendblock') {
                putAppendBlobHandler.process(request, res);
            } else if (req.query.comp === 'snapshot') {
                snapshotBlobHandler.process(req, res, req.params.container, req.params[0]);
            } else if (req.query.comp === 'lease') {
                leaseBlobHandler.process(req, res, req.params.container, req.params[0]);
            } else if (blobType) {
                putBlobHandler.process(request, res);
            } else if (req.query.comp === 'metadata') {
                // Set Blob Metadata
                setBlobMetadataHandler.process(req, res, req.params.container, req.params[0]);
            } else if (req.query.comp === 'properties') {
                // Set Blob Properties
                setBlobPropertiesHandler.process(req, res, req.params.container, req.params[0]);
            } else {
                res.status(400).send('Not supported.');
            }
        })
        .delete((req, res) => {
            const request = new BlobRequest({
                req: req,
                usage: Usage.Write // This will be deprecated if validation is moved to dedicated middleware module
            });
            deleteBlobHandler.process(request, res);
        });
}