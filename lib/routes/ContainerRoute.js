'use strict';

const createContainerHandler = require('./../api/CreateContainer'),
      deleteContainerHandler = require('./../api/DeleteContainer'),
      listBlobsHandler = require('./../api/ListBlobs'),
      setContainerMetadataHandler = require('./../api/SetContainerMetadata'),
      env = require('./../env');

/*
 * Route definitions for all operation on the 'Container' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container`)
        .get((req, res) => {
            const restype = req.query.restype,
                  comp = req.query.comp;
            if (restype === 'container' && comp === 'list') {
                listBlobsHandler.process(req, res, req.params.container);
            }
        })
        .post((req, res) => {
        })
        .put((req, res) => {
            if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                setContainerMetadataHandler.process(req, res, req.params.container);   
            }
            else if (req.query.restype === 'container') {
                createContainerHandler.process(req, res, req.params.container);
            }
        })
        .delete((req, res) => {
            if (req.query.restype === 'container') {
                deleteContainerHandler.process(req, res, req.params.container);
            }
        });
}