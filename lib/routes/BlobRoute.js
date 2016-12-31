'use strict';

const env = require('./../env'),
    putBlobHandler = require('./../api/PutBlob'),
    deleteBlobHandler = require('./../api/DeleteBlob'),
    getBlobHandler = require('./../api/GetBlob'),
    putBlockHandler = require('./../api/PutBlock'),
    putBlockListHandler = require('./../api/PutBlockList'),
    getBlockListHandler = require('./../api/GetBlockList'),
    setBlobMetadataHandler = require('./../api/SetBlobMetadata'),
    getBlobMetadataHandler = require('./../api/GetBlobMetadata'),
    setBlobPropertiesHandler = require('./../api/SetBlobProperties'),
    getBlobPropertiesHandler = require('./../api/GetBlobProperties'),
    getPutAppendBlobHandler = require('./../api/PutAppendBlock');

/*
 * Route definitions for all operation on the 'Blob' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container/:blob`)
        .get((req, res) => {
            if (req.query.comp === 'blocklist') {
                // GET BLockList
                getBlockListHandler.process(req, res, req.params.container, req.params.blob);
            } else if (req.query.comp === 'metadata') {
                // GET Blob Metadata
                getBlobMetadataHandler.process(req, res, req.params.container, req.params.blob);
            } else {
                // GET Blob
                getBlobHandler.process(req, res, req.params.container, req.params.blob);
            }
        })
        .head((req, res) => {
            // Get Blob Properties
            getBlobPropertiesHandler.process(req, res, req.params.container, req.params.blob);
        })
        .post((req, res) => {
        })
        .put((req, res) => {
            const blobType = req.headers['x-ms-blob-type'];
            if (req.query.comp === 'block') {
                putBlockHandler.process(req, res, req.params.container, req.params.blob, req.query.blockid);
            } else if (req.query.comp === 'blocklist') {
                putBlockListHandler.process(req, res, req.params.container, req.params.blob, req.body); oe
            } else if (blobType === 'AppendBlob' && req.query.comp === 'appendblock') {
                getPutAppendBlobHandler.process(req, res, req.params.container, req.params.blob, req.body);
            } else if (blobType) {
                putBlobHandler.process(req, res, req.params.container, req.params.blob, blobType);
            } else if (req.query.comp === 'metadata') {
                // Set Blob Metadata
                setBlobMetadataHandler.process(req, res, req.params.container, req.params.blob);
            } else if (req.query.comp === 'properties') {
                // Set Blob Properties
                setBlobPropertiesHandler.process(req, res, req.params.container, req.params.blob);
            } else {
                res.status(400).send('Not supported.');
            }
        })
        .delete((req, res) => {
            deleteBlobHandler.process(req, res, req.params.container, req.params.blob);
        });
}