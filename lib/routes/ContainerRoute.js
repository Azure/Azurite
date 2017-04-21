'use strict';

const createContainerHandler = require('./../api/CreateContainer'),
    deleteContainerHandler = require('./../api/DeleteContainer'),
    listBlobsHandler = require('./../api/ListBlobs'),
    setContainerMetadataHandler = require('./../api/SetContainerMetadata'),
    getContainerMetadataHandler = require('./../api/GetContainerMetadata'),
    getContainerPropertiesHandler = require('./../api/GetContainerProperties'),
    setContainerAclHandler = require('./../api/SetContainerAcl'),
    getContainerAclHandler = require('./../api/GetContainerAcl'),
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
            } else if (restype === 'container' && comp === 'metadata') {
                getContainerMetadataHandler.process(req, res, req.params.container);
            } else if (restype === 'container' && comp === 'acl') {
                getContainerAclHandler.process(req, res, req.params.container);
            } else if (restype === 'container') {
                getContainerPropertiesHandler.process(req, res, req.params.container);
            }
        })
        .head((req, res) => {
            const restype = req.query.restype,
                comp = req.query.comp;
            if (restype === 'container' && comp === 'metadata') {
                getContainerMetadataHandler.process(req, res, req.params.container);
            }
            else if (restype === 'container' && comp === 'acl') {
                getContainerAclHandler.process(req, res, req.params.container);
            } else if (restype === 'container') {
                getContainerPropertiesHandler.process(req, res, req.params.container);
            }
        })
        .put((req, res) => {
            if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                setContainerMetadataHandler.process(req, res, req.params.container);
            }
            else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                setContainerAclHandler.process(req, res, req.params.container, req.body);
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
