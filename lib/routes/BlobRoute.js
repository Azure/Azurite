'use strict';

const env = require('./../env'),
    createBlockBlobHandler = require('./../api/CreateBlockBlob'),
    deleteBlobHandler = require('./../api/DeleteBlob'),
    getBlobHandler = require('./../api/GetBlob'),
    putBlockHandler = require('./../api/PutBlock'),
    putBlockListHandler = require('./../api/PutBlockList'),
    getBlockListHandler = require('./../api/GetBlockList');

/*
 * Route definitions for all operation on the 'Blob' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container/:blob`)
        .get((req, res) => {
            // GET BLockList
            if (req.query.comp === 'blocklist') {
                getBlockListHandler.process(req, res, req.params.container, req.params.blob);
            // GET Blob
            } else {
                getBlobHandler.process(req, res, req.params.container, req.params.blob);
            }
        })
        .post((req, res) => {
        })
        .put((req, res) => {
            const blobType = req.headers['x-ms-blob-type'];
            // PUT Block
            if (req.query.comp === 'block') {
                putBlockHandler.process(req, res, req.params.container, req.params.blob, req.query.blockid);
            // PUT Blob    
            } else if (req.query.comp === 'blocklist') {
                putBlockListHandler.process(req, res, req.params.container, req.params.blob, req.body);
            } else if (blobType === 'BlockBlob') {
                createBlockBlobHandler.process(req, res, req.params.container, req.params.blob);
            } else {
                res.status(500).send('Not supported yet. Azurite only supports Block Blobs.');
            }
        })
        .delete((req, res) => {
            deleteBlobHandler.process(req, res, req.params.container, req.params.blob);
        });
}