'use strict';

const listContainersHandler = require('./../api/ListContainers'),
    env = require('./../env');

/*
 * Route definitions for all operation on the 'Account' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}`)
        .get((req, res) => {
            const request = new ContainerRequest({
                req: req
            });
            if (req.query.comp === 'list') {
                listContainersHandler.process(request, res);
            } else {
                res.status(400).send();
            }
        });
}