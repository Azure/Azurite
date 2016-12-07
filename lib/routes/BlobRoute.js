'use strict';

const env = require('./../env'),
      createBlockBlobHandler = require('./../api/CreateBlockBlob');

/*
 * Route definitions for all operation on the 'Blob' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container/:blob`)
        .get((req, res) => {
        })
        .post((req, res) => {
        })
        .put((req, res) => {
            let blobType = req.headers['x-ms-blob-type'];
            if (blobType === 'BlockBlob') {
                createBlockBlobHandler.process(req, res, req.params.container, req.params.blob);
            } else {
                res.status(500).send('Not supported yet. Azurite only supports Block Blobs.');
            }
        });
}