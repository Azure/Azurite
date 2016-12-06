'use strict';

const env = require('./../env'),
      listContainersHandler = require('./../api/ListContainers');

/*
 * Route definitions for all operation on the 'Account' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}`)
        .get((req, res) => {
            let comp = req.query.comp;
            if(comp === 'list') {
                listContainersHandler.process(req, res);
            }
        })
        .post((req, res) => {

        })
        .put((req, res) => {
        });
}