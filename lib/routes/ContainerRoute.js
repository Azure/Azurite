'use strict';

const createContainerHandler = require('./../api/CreateContainer'),
    deleteContainerHandler = require('./../api/DeleteContainer'),
    listBlobsHandler = require('./../api/ListBlobs'),
    setContainerMetadataHandler = require('./../api/SetContainerMetadata'),
    getContainerMetadataHandler = require('./../api/GetContainerMetadata'),
    getContainerPropertiesHandler = require('./../api/GetContainerProperties'),
    setContainerAclHandler = require('./../api/SetContainerAcl'),
    getContainerAclHandler = require('./../api/GetContainerAcl'),
    leaseContainerHandler = require('./../api/LeaseContainer'),
    standardHandler = require('./../api/StandardHandler'),
    ContainerRequest = require('./../model/AzuriteContainerRequest'),
    StorageManager = require('./../StorageManager'),
    Usage = require('./../Constants').Usage,
    env = require('./../env');

/*
 * Route definitions for all operation on the 'Container' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container`)
        .get((req, res) => {
            const request = new ContainerRequest({
                req: req,
                usage: Usage.Other
            });
            if (req.query.restype === 'container' && req.query.comp === 'list') {
                listBlobsHandler.process(request, res);
            } else if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                getContainerMetadataHandler.process(request, res);
            } else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                getContainerAclHandler.process(request, res);
            } else if (req.query.restype === 'container') {
                getContainerPropertiesHandler.process(request, res);
            }
        })
        .head((req, res) => {
            const request = new ContainerRequest({
                req: req,
                usage: Usage.Other
            });
            if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                getContainerMetadataHandler.process(req, res, req.params.container);
            }
            else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                getContainerAclHandler.process(req, res, req.params.container);
            } else if (req.query.restype === 'container') {
                getContainerPropertiesHandler.process(req, res, req.params.container);
            }
        })
        .put((req, res) => {
            const request = new ContainerRequest({
                req: req,
                usage: Usage.Write
            });
            if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                setContainerMetadataHandler.process(request, res);
            }
            else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                setContainerAclHandler.process(request, res);
            }
            else if (req.query.restype === 'container' && req.query.comp === 'lease') {
                leaseContainerHandler.process(request, res);
            }
            else if (req.query.restype === 'container') {
                standardHandler.process(request, res, StorageManager.createContainer);
            }
        })
        .delete((req, res) => {
            const request = new ContainerRequest({
                req: req,
                usage: Usage.Delete
            });
            if (req.query.restype === 'container') {
                standardHandler.process(request, res, StorageManager.deleteContainer);
            }
        });
}
