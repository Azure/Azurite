'use strict';

let env = require('./../env');

/*
 * Route definitions for all operation on the 'Account' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}`)
        .get((req, res) => {
            let c = req.param.comp;
            console.log(c);
        })
        .post((req, res) => {

        })
        .put((req, res) => {
        });
}