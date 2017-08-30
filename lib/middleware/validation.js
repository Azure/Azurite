'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../Constants').Operations,
    Usage = require('./../Constants').Usage,
    AzuriteContainerRequest = require('./../model/AzuriteContainerRequest'),
    AzuriteBlobRequest = require('./../model/AzuriteBlobRequest'),
    sm = require('./../StorageManager'),
    // Validation modules
    ValidationContext = require('./validation/ValidationContext'),
    AppendMaxBlobCommittedBlocksVal = require('./validation/AppendMaxBlobCommittedBlocks'),
    BlobCreationSizeVal = require('./validation/BlobCreationSize'),
    BlockPageSizeVal = require('./validation/BlockPageSize'),
    SupportedBlobTypeVal = require('./validation/SupportedBlobType'),
    CompatibleBlobTypeVal = require('./validation/CompatibleBlobType'),
    MD5Val = require('./validation/MD5'),
    ConflictingItemVal = require('./validation/ConflictingItem'),
    ContentLengthExistsVal = require('./validation/ContentLengthExists'),
    ContainerExistsVal = require('./validation/ContainerExists'),
    BlobExistsVal = require('./validation/BlobExists'),
    BlobCommittedVal = require('./validation/BlobCommitted'),
    IsOfBlobTypeVal = require('./validation/IsOfBlobType'),
    RangeVal = require('./validation/Range'),
    PageAlignmentVal = require('./validation/PageAlignment'),
    NumOfSignedIdentifiersVal = require('./validation/NumOfSignedIdentifiers'),
    PutBlobHeaderVal = require('./validation/PutBlobHeaders'),
    ConditionalRequestHeadersVal = require('./validation/ConditionalRequestHeaders'),
    AppendBlobConditionalRequestHeadersVal = require('./validation/AppendBlobConditionalRequestHeaders'),
    PageBlobHeaderSanityVal = require('./validation/PageBlobHeaderSanity'),
    AssociatedSnapshotDeletion = require('./validation/AssociatedSnapshotsDeletion'),
    LeaseActionsValidation = require('./validation/LeaseActions'),
    LeaseDurationValidation = require('./validation/LeaseDuration'),
    LeaseIdValidation = require('./validation/LeaseId'),
    ContainerLeaseUsageValidation = require('./validation/ContainerLeaseUsage'),
    BlobLeaseUsageValidation = require('./validation/BlobLeaseUsage');

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
    const { blobProxy } = sm._getCollectionAndBlob({ containerName: request.containerName, blobName: request.blobName });
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

validations[Operations.Blob.APPEND_BLOCK] = (request) => {
    const { containerProxy } = sm._getCollectionAndContainer(request.containerName);
    const { blobProxy } = sm._getCollectionAndBlob({ containerName: request.containerName, blobName: request.blobName });
    new ValidationContext({
        request: request,
        containerProxy: containerProxy,
        blobProxy: blobProxy
    })
        .run(ContentLengthExistsVal)
        .run(ContainerExistsVal)
        .run(BlockPageSizeVal)
        .run(MD5Val)
        .run(AppendMaxBlobCommittedBlocksVal)
        .run(CompatibleBlobTypeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(AppendBlobConditionalRequestHeadersVal);
}

validations[Operations.Blob.DELETE_BLOB] = (request) => {
    const { blobProxy } = sm._getCollectionAndBlob({ containerName: request.containerName, blobName: request.blobName });
    new ValidationContext({
        request: request,
        blobProxy: blobProxy
    })
        .run(BlobExistsVal)
        .run(AssociatedSnapshotDeletion, { collection: this.db.getCollection(request.containerName) })
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
}

validations[Operations.Blob.GET_BLOB] = (request) => {
    const { blobProxy } = sm._getCollectionAndBlob({ containerName: request.containerName, blobName: request.blobName });
    new ValidationContext({
        request: request,
        blobProxy: blobProxy
    })
        .run(BlobExistsVal)
        .run(BlobCommittedVal)
        .run(RangeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Read })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Read })
}

validations[Operations.Container.LIST_BLOBS] = (request) => {
    const { containerProxy } = sm._getCollectionAndContainer(request.containerName);
    new ValidationContext({
        containerProxy: containerProxy
    })
        .run(ContainerExistsVal);
}

validations[Operations.Blob.PUT_BLOCK] = (request) => {
    const { containerProxy } = sm._getCollectionAndContainer(request.containerName);
    const { blobProxy } = sm._getCollectionAndBlob({ containerName: request.containerName, blobName: request.blobName });
    new ValidationContext({
        request: request,
        containerProxy: containerProxy,
        blobProxy: blobProxy
    })
        .run(ContentLengthExistsVal)
        .run(BlockPageSizeVal)
        .run(ContainerExistsVal)
        .run(MD5Val)
        .run(CompatibleBlobTypeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
}