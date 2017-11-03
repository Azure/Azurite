'use strict';

const env = require('./../../env'),
    Operations = require('./../../Constants').Operations;

/*
 * Route definitions for all operation on the 'message' resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-messages
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:queue/messages/:messageId`)
        .get((req, res, next) => {
            next();
        })
        .head((req, res, next) => {
            next();
        })
        .put((req, res, next) => {
            next();
        })
        .delete((req, res, next) => {
            next();
        });
}