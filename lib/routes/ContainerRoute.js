'use strict';

const ContainerRequest = require('./../model/AzuriteContainerRequest'),
    StorageManager = require('./../StorageManager'),
    Usage = require('./../Constants').Usage,
    env = require('./../env'),
    ContainerRequest = require('./../model/AzuriteContainerRequest'),
    Serializers = require('./../xml/Serializers'),
    Operations = require('./../Constants').Operations;

/*
 * Route definitions for all operation on the 'Container' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container`)
        .get((req, res) => {
            if (req.query.restype === 'container' && req.query.comp === 'list') {
                req.azuriteOperation = Operations.Container.LIST_BLOBS;
            } else if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_METADATA;
            } else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_ACL;
            } else if (req.query.restype === 'container') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_PROPERTIES;
            }
            req.azuriteRequest = new ContainerRequest({ req: req });
            next();
        })
        .head((req, res) => {
            if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_METADATA;
            }
            else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_ACL;
            } else if (req.query.restype === 'container') {
                req.azuriteOperation = Operations.Container.GET_CONTAINER_PROPERTIES;
            }
            req.azuriteRequest = new ContainerRequest({ req: req });
            next();
        })
        .put((req, res) => {
            if (req.query.restype === 'container' && req.query.comp === 'metadata') {
                req.azuriteOperation = Operations.Container.SET_CONTAINER_METADATA;
                Serializers.parseSignedIdentifiers(req.body)
                    .then((signedIdentifiers) => {
                        req.azuritePayload = signedIdentifiers;
                        req.azuriteRequest = new ContainerRequest({ req: req });
                        next();
                    })
                return;
            }
            else if (req.query.restype === 'container' && req.query.comp === 'acl') {
                req.azuriteOperation = Operations.Container.SET_CONTAINER_ACL;
            }
            else if (req.query.restype === 'container' && req.query.comp === 'lease') {
                req.azuriteOperation = Operations.Container.LEASE_CONTAINER;
            }
            else if (req.query.restype === 'container') {
                req.azuriteOperation = Operations.Container.CREATE_CONTAINER;
            }
            req.azuriteRequest = new ContainerRequest({ req: req });
            next();
        })
        .delete((req, res) => {
            if (req.query.restype === 'container') {
                req.azuriteOperation = Operations.Container.DELETE_CONTAINER;
            }
            req.azuriteRequest = new ContainerRequest({ req: req });
            next();
        });
}
