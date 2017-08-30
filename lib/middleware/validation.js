'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../Constants').Operations,
    Usage = require('./../Constants').Usage,
    AzuriteContainerRequest = require('./../model/AzuriteContainerRequest'),
    AzuriteBlobRequest = require('./../model/AzuriteBlobRequest'),
    sm = require('./../StorageManager'),
    ValidationContext = require('./validation/ValidationContext'),
    ConflictingContainerVal = require('./validation/ConflictingContainer'),
    ContainerExistsVal = require('./validation/ContainerExists'),
    ContainerLeaseUsageValidation = require('./validation/ContainerLeaseUsage');

exports.azuriteValidation = (req, res, next) => {
    BbPromise.try(() => {
        validations[req.azuriteOperation](req.azuriteRequest);
        next();
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const validations = {};
validations[Operations.Container.CREATE_CONTAINER] = (request) => {
    const { proxy } = sm._getCollectionAndContainer(request.containerName);
    new ValidationContext({ containerProxy: proxy })
        .run(ConflictingContainerVal);
}

validations[Operations.Container.DELETE_CONTAINER] = (request) => {
    const { proxy } = sm._getCollectionAndContainer(request.containerName);    
    new ValidationContext({
        containerProxy: proxy,
        request: request
    })
        .run(ContainerExistsVal)
        .run(ContainerLeaseUsageValidation, { usage: Usage.Delete });
}

validations[Operations.Blob.PUT_BLOB] = (request) => {
    const { containerProxy } = sm._getCollectionAndContainer(request.containerName);
    const { blobProxy } = sm._getCollectionAndBlob({containerName: request.containerName, blobName: request.blobName });    
    
    new ValidationContext({
        request: request,
        containerProxy: containerProxy,
        blobProxy: blobProxy
    })
        .run(MD5Val)
        .run(ContainerExistsVal)
        .run(CompatibleBlobTypeVal)
        .run(SupportedBlobTypeVal)
        .run(PutBlobHeaderVal)
        .run(BlobCreationSizeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
}