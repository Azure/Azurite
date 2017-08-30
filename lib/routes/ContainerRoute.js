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
    ContainerRequest = require('./../model/AzuriteContainerRequest'),
    StorageManager = require('./../StorageManager'),
    Usage = require('./../Constants').Usage,
    env = require('./../env'),
    Operations = require('./../Constants').Operations;

/*
 * Route definitions for all operation on the 'Container' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container`)
        .get((req, res) => {
            // const request = new ContainerRequest({
            //     req: req,
            //     usage: Usage.Other
            // });
            if (req.query.restype === 'container' && req.query.comp === 'list') {
                req.azuriteOperation = Operations.Container.LIST_BLOBS;
                // listBlobsHandler.process(request, res);
            } else if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_METADATA;
                // getContainerMetadataHandler.process(request, res);
            } else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_ACL;
                // getContainerAclHandler.process(request, res);
            } else if (req.query.restype === 'container') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_PROPERTIES;
                // getContainerPropertiesHandler.process(request, res);
            }
            next();
        })
        .head((req, res) => {
            // const request = new ContainerRequest({
            //     req: req,
            //     usage: Usage.Other
            // });
            if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_METADATA;                
                // getContainerMetadataHandler.process(req, res, req.params.container);
            }
            else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_ACL;
                // getContainerAclHandler.process(req, res, req.params.container);
            } else if (req.query.restype === 'container') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_PROPERTIES;                
                // getContainerPropertiesHandler.process(req, res, req.params.container);
            }
            next();
        })
        .put((req, res) => {
            // const request = new ContainerRequest({
            //     req: req,
            //     usage: Usage.Write
            // });
            if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                req.azuriteOperation = Operations.Container.SET_CONTAINER_METADATA;                
                // setContainerMetadataHandler.process(request, res);
            }
            else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                req.azuriteOperation = Operations.Container.SET_CONTAINER_ACL;                                
                // setContainerAclHandler.process(request, res);
            }
            else if (req.query.restype === 'container' && req.query.comp === 'lease') {
                req.azuriteOperation = Operations.Container.LEASE_CONTAINER;                
                // leaseContainerHandler.process(request, res);
            }
            else if (req.query.restype === 'container') {
                req.azuriteOperation = Operations.Container.CREATE_CONTAINER;                                
                // createContainerHandler.process(request, res);
            }
            next();
        })
        .delete((req, res) => {
            // const request = new ContainerRequest({
            //     req: req,
            //     usage: Usage.Delete
            // });
            if (req.query.restype === 'container') {
                req.azuriteOperation = Operations.Container.DELETE_CONTAINER;
                // deleteContainerHandler.process(request, res);
            }
            next();
        });
}
