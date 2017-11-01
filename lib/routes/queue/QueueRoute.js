'use strict';

const env = require('./../../env'),
    Serializers = require('./../../xml/blob/Serializers'),
    Operations = require('./../../Constants').Operations;

/*
 * Route definitions for all operation on the 'queue' resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-queues
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:queue/`)
        .get((req, res, next) => {
            next();
        })
        .head((req, res, next) => {
            next();
        })
        .put((req, res, next) => {
            req.azuriteRequest = {};
            next();
        })
        .delete((req, res, next) => {
            next();
        });
}