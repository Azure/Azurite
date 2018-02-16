'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../../core/Constants').Operations,
    // Actions
    createContainer = require('./../../actions/blob/CreateContainer'),
    deleteBlob = require('./../../actions/blob/DeleteBlob'),
    deleteContainer = require('./../../actions/blob/DeleteContainer'),
    getBlob = require('./../../actions/blob/GetBlob'),
    getBlobMetadata = require('./../../actions/blob/GetBlobMetadata'),
    getBlobProperties = require('./../../actions/blob/GetBlobProperties'),
    getBlockList = require('./../../actions/blob/GetBlockList'),
    getContainerAcl = require('./../../actions/blob/GetContainerAcl'),
    getContainerMetadata = require('./../../actions/blob/GetContainerMetadata'),
    getContainerProperties = require('./../../actions/blob/GetContainerProperties'),
    getPageRanges = require('./../../actions/blob/GetPageRanges'),
    leaseBlob = require('./../../actions/blob/LeaseBlob'),
    leaseContainer = require('./../../actions/blob/LeaseContainer'),
    listBlobs = require('./../../actions/blob/ListBlobs'),
    listContainers = require('./../../actions/blob/ListContainers'),
    putAppendBlock = require('./../../actions/blob/PutAppendBlock'),
    putBlob = require('./../../actions/blob/PutBlob'),
    putBlock = require('./../../actions/blob/PutBlock'),
    putBlockList = require('./../../actions/blob/PutBlockList'),
    putPage = require('./../../actions/blob/PutPage'),
    setBlobMetadata = require('./../../actions/blob/SetBlobMetadata'),
    setBlobProperties = require('./../../actions/blob/SetBlobProperties'),
    setBlobServiceProperties = require('./../../actions/blob/SetBlobServiceProperties'),
    setContainerAcl = require('./../../actions/blob/SetContainerAcl'),
    setContainerMetadata = require('./../../actions/blob/SetContainerMetadata'),
    snapshotBlob = require('./../../actions/blob/SnapshotBlob'),
    copyBlob = require('./../../actions/blob/CopyBlob'),
    abortCopyBlob = require('./../../actions/blob/AbortCopyBlob');


module.exports = (req, res) => {
    BbPromise.try(() => {
        actions[req.azuriteOperation](req.azuriteRequest, res);
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const actions = {};

actions[undefined] = (request, res) => {
    res.status(501).send('Not Implemented yet.');
}

actions[Operations.Account.SET_BLOB_SERVICE_PROPERTIES] = (request, res) => {
    setBlobServiceProperties.process(request, res);
}

actions[Operations.Account.LIST_CONTAINERS] = (request, res) => {
    listContainers.process(request, res);
}

actions[Operations.Container.CREATE_CONTAINER] = (request, res) => {
    createContainer.process(request, res);
}

actions[Operations.Container.DELETE_CONTAINER] = (request, res) => {
    deleteContainer.process(request, res);
}

actions[Operations.Blob.PUT_BLOB] = (request, res) => {
    putBlob.process(request, res);
}

actions[Operations.Blob.APPEND_BLOCK] = (request, res) => {
    putAppendBlock.process(request, res);
}

actions[Operations.Blob.DELETE_BLOB] = (request, res) => {
    deleteBlob.process(request, res);
}

actions[Operations.Blob.GET_BLOB] = (request, res) => {
    getBlob.process(request, res);
}

actions[Operations.Container.LIST_BLOBS] = (request, res) => {
    listBlobs.process(request, res);
}

actions[Operations.Blob.PUT_BLOCK] = (request, res) => {
    putBlock.process(request, res);
}

actions[Operations.Blob.PUT_BLOCK_LIST] = (request, res) => {
    putBlockList.process(request, res);
}

actions[Operations.Blob.GET_BLOCK_LIST] = (request, res) => {
    getBlockList.process(request, res);
}

actions[Operations.Blob.SET_BLOB_METADATA] = (request, res) => {
    setBlobMetadata.process(request, res);
}

actions[Operations.Blob.GET_BLOB_METADATA] = (request, res) => {
    getBlobMetadata.process(request, res);
}

actions[Operations.Blob.GET_BLOB_PROPERTIES] = (request, res) => {
    getBlobProperties.process(request, res);
}

actions[Operations.Blob.SET_BLOB_PROPERTIES] = (request, res) => {
    setBlobProperties.process(request, res);
}

actions[Operations.Container.SET_CONTAINER_METADATA] = (request, res) => {
    setContainerMetadata.process(request, res);
}

actions[Operations.Container.GET_CONTAINER_METADATA] = (request, res) => {
    getContainerMetadata.process(request, res);
}

actions[Operations.Container.GET_CONTAINER_PROPERTIES] = (request, res) => {
    getContainerProperties.process(request, res);
}

actions[Operations.Blob.PUT_PAGE] = (request, res) => {
    putPage.process(request, res);
}

actions[Operations.Blob.GET_PAGE_RANGES] = (request, res) => {
    getPageRanges.process(request, res);
}

actions[Operations.Container.SET_CONTAINER_ACL] = (request, res) => {
    setContainerAcl.process(request, res);
}

actions[Operations.Container.GET_CONTAINER_ACL] = (request, res) => {
    getContainerAcl.process(request, res);
}

actions[Operations.Blob.SNAPSHOT_BLOB] = (request, res) => {
    snapshotBlob.process(request, res);
}

actions[Operations.Container.LEASE_CONTAINER] = (request, res) => {
    leaseContainer.process(request, res);
}

actions[Operations.Blob.LEASE_BLOB] = (request, res) => {
    leaseBlob.process(request, res);
}

actions[Operations.Blob.COPY_BLOB] = (request, res) => {
    copyBlob.process(request, res);
}

actions[Operations.Blob.ABORT_COPY_BLOB] = (request, res) => {
    abortCopyBlob.process(request, res);
}