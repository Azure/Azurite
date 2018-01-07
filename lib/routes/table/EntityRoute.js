'use strict';

/*
 * Route definitions for all operation on the 'message' resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-entities
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:table`)
        .get((req, res, next) => {
            next();
        })
        .head((req, res, next) => {
            next();
        })
        .put((req, res, next) => {
            next();
        })
        .post((req, res, next) => {
            next();
        })
        .delete((req, res, next) => {
            next();
        });
}