'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../Constants').Operations,
    // Actions
    createContainer = require('./../actions/CreateContainer'),
    deleteBlob = require('./../actions/DeleteBlob'),
    deleteContainer = require('./../actions/DeleteContainer'),
    getBlob = require('./../actions/GetBlob'),
    getBlobMetadata = require('./../actions/getBlobMetadata'),
    getBlobProperties = require('./../actions/getBlobProperties'),
    getBlockList = require('./../actions/GetBlockList'),
    getContainerAcl = require('./../actions/GetContainerAcl'),
    getContainerMetadata = require('./../actions/GetContainerMetadata'),
    getContainerProperties = require('./../actions/GetContainerProperties'),
    getPageRanges = require('./../actions/GetPageRanges'),
    leaseBlob = require('./../actions/LeaseBlob'),
    leaseContainer = require('./../actions/LeaseContainer'),
    listBlobs = require('./../actions/ListBlobs'),
    listContainers = require('./../actions/ListContainers'),
    putAppendBlock = require('./../actions/PutAppendBlock'),
    putBlob = require('./../actions/PutBlob'),
    putBlock = require('./../actions/PutBlock'),
    putBlockList = require('./../actions/PutBlockList'),
    putPage = require('./../actions/PutPage'),
    setBlobMetadata = require('./../actions/SetBlobMetadata'),
    setBlobProperties = require('./../actions/SetBlobProperties'),
    setContainerAcl = require('./../actions/SetContainerAcl'),
    setContainerMetadata = require('./../actions/SetContainerMetadata'),
    snapshotBlob = require('./../actions/SnapshotBlob');


module.exports = (req, res) => {
    BbPromise.try(() => {
        actions[req.azuriteOperation](req.azuriteRequest, res);
        // Refactor me: Move this to bin/azurite (exception needs to carry res object), and handle entire exception handling there
    }).catch((e) => {
        // e.res = res;
        // throw e;
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const actions = {};
actions[Operations.Container.CREATE_CONTAINER] = (request, res) => {
    createContainer.process(request, res);
}

actions[Operations.Container.DELETE_CONTAINER] = (request, res) => {
    deleteContainer.process(request, res);
}

actions[Operations.Blob.PUT_BLOB] = (request, res) => {
    putBlob(request, res);
}

actions[Operations.Blob.APPEND_BLOCK] = (request, res) => {
    putAppendBlock(request, res);
}

actions[Operations.Blob.DELETE_BLOB] = (request, res) => {
    deleteBlob(request, res);
}

actions[Operations.Blob.GET_BLOB] = (request, res) => {
    getBlob(request, res);
}

actions[Operations.Container.LIST_BLOBS] = (request, res) => {
    listBlobs(request, res);
}

actions[Operations.Blob.PUT_BLOCK] = (request, res) => {
    putBlock(request, res);
}

actions[Operations.Blob.PUT_BLOCK_LIST] = (request, res) => {
    putBlockList(request, res);
}

actions[Operations.Blob.GET_BLOCK_LIST] = (request, res) => {
    getBlockList(request, res);
}

actions[Operations.Blob.SET_BLOB_METADATA] = (request, res) => {
    setBlobMetadata(request, res);
}

actions[Operations.Blob.GET_BLOB_METADATA] = (request, res) => {
    getBlobMetadata(request, res);
}

actions[Operations.Blob.SET_BLOB_PROPERTIES] = (request, res) => {
    setBlobProperties(request, res);
}

actions[Operations.Container.SET_CONTAINER_METADATA] = (request, res) => {
    setContainerMetadata(request, res);
}

actions[Operations.Container.GET_CONTAINER_METADATA] = (request, res) => {
    getContainerMetadata(request, res);
}

actions[Operations.Container.GET_CONTAINER_PROPERTIES] = (request, res) => {
    getContainerProperties(request, res);
}

actions[Operations.Blob.PUT_PAGE] = (request, res) => {
    putPage(request, res);
}

actions[Operations.Blob.GET_PAGE_RANGES] = (request, res) => {
    getPageRanges(request, res);
}

actions[Operations.Container.SET_CONTAINER_ACL] = (request, res) => {
    setContainerAcl(request, res);
}

actions[Operations.Container.GET_CONTAINER_ACL] = (request, res) => {
    getContainerAcl(request, res);
}

actions[Operations.Blob.SNAPSHOT_BLOB] = (request, res) => {
    snapshotBlob(request, res);
}

actions[Operations.Container.LEASE_CONTAINER] = (request, res) => {
    leaseContainer(request, res);
}

actions[Operations.Blob.LEASE_BLOB] = (request, res) => {
    leaseBlob(request, res);
}