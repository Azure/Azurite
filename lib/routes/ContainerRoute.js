'use strict';

const createContainerHandler = require('./../api/CreateContainer'),
      env = require('./../env');

/*
 * Route definitions for all operation on the 'Container' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:container`)
        .get((req, res) => {
        })
        .post((req, res) => {
        })
        .put((req, res) => {
            createContainerHandler.process(req, res);
        });
}