'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../Constants').Operations,
    AzuriteContainerRequest = require('./../model/AzuriteContainerRequest'),
    AzuriteBlobRequest = require('./../model/AzuriteBlobRequest'),
    sm = require('./../StorageManager'),
    ValidationContext = require('./validation/ValidationContext');


exports.azuriteValidation = (req, res, next) => {
    BbPromise.try(() => {
        validations[req.azuriteOperation](req);
        next();
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const validations = {};
validations[Operations.Container.CREATE_CONTAINER] = (req) => {
    const request = new AzuriteContainerRequest({ req: req });
    const { proxy } = sm._getCollectionAndContainer(request.containerName);
    new ValidationContext({ proxy: proxy })
        .run(ConflictingContainerVal);
}