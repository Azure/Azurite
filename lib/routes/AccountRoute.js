'use strict';

const listContainersHandler = require('./../api/ListContainers'),
    env = require('./../env'),
    Operations = require('./../Constants').Operations;

/*
 * Route definitions for all operation on the 'Account' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}`)
        .get((req, res) => {
            // const request = new ContainerRequest({
            //     req: req
            // });
            if (req.query.comp === 'list') {
                req.azuriteOperation = Operations.Account.LIST_CONTAINERS;
                // listContainersHandler.process(request, res);
            }
            next();
        });
}