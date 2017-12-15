"use strict";

const ContainerRequest = require("./../../model/blob/AzuriteContainerRequest"),
    StorageManager = require("./../../core/blob/StorageManager"),
    Usage = require("./../../core/Constants").Usage,
    env = require("./../../core/env"),
    Serializers = require("./../../xml/Serializers"),
    Operations = require("./../../core/Constants").Operations;

/*
 * Route definitions for all operation on the 'Container' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
module.exports = app => {
    app.route("*").all((req, res, next) => {
        if (req.azuriteRequest) {
            next();
        } else {
            res.status(404);
            res.send(
                "path did not match any emulated command, are you missing the account name path parameter?"
            );
        }
    });
};
