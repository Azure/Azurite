'use strict';

/*
 * Route definitions for all operation on the 'Blob' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = (app) => {
    app.route('/:container/:blob')
        .get((req, res) => {
        })
        .post((req, res) => {

        })
        .put((req, res) => {
        });
}