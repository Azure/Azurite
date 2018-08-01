'use strict';

import BbPromise from 'bluebird';
import { Operations } from './../../core/Constants';

// Actions
import createContainer from './../../actions/blob/CreateContainer';

import deleteBlob from './../../actions/blob/DeleteBlob';
import deleteContainer from './../../actions/blob/DeleteContainer';
import getBlob from './../../actions/blob/GetBlob';
import getBlobMetadata from './../../actions/blob/GetBlobMetadata';
import getBlobProperties from './../../actions/blob/GetBlobProperties';
import getBlockList from './../../actions/blob/GetBlockList';
import getContainerAcl from './../../actions/blob/GetContainerAcl';
import getContainerMetadata from './../../actions/blob/GetContainerMetadata';
import getContainerProperties from './../../actions/blob/GetContainerProperties';
import getPageRanges from './../../actions/blob/GetPageRanges';
import leaseBlob from './../../actions/blob/LeaseBlob';
import leaseContainer from './../../actions/blob/LeaseContainer';
import listBlobs from './../../actions/blob/ListBlobs';
import listContainers from './../../actions/blob/ListContainers';
import putAppendBlock from './../../actions/blob/PutAppendBlock';
import putBlob from './../../actions/blob/PutBlob';
import putBlock from './../../actions/blob/PutBlock';
import putBlockList from './../../actions/blob/PutBlockList';
import putPage from './../../actions/blob/PutPage';
import setBlobMetadata from './../../actions/blob/SetBlobMetadata';
import setBlobProperties from './../../actions/blob/SetBlobProperties';
import setBlobServiceProperties from './../../actions/blob/SetBlobServiceProperties';
import getBlobServiceProperties from './../../actions/blob/GetBlobServiceProperties';
import preflightBlobRequest from './../../actions/blob/PreflightBlobRequest';
import setContainerAcl from './../../actions/blob/SetContainerAcl';
import setContainerMetadata from './../../actions/blob/SetContainerMetadata';
import snapshotBlob from './../../actions/blob/SnapshotBlob';
import copyBlob from './../../actions/blob/CopyBlob';
import abortCopyBlob from './../../actions/blob/AbortCopyBlob';


export default (req, res) => {
    BbPromise.try(() => {
        actions[req.azuriteOperation](req.azuriteRequest, res);
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
};

const actions = {};

actions[undefined] = (request, res) => {
    res.status(501).send('Not Implemented yet.');
}

actions[Operations.Account.PREFLIGHT_BLOB_REQUEST] = (request, res) => {
    preflightBlobRequest.process(request, res);
}

actions[Operations.Account.SET_BLOB_SERVICE_PROPERTIES] = (request, res) => {
    setBlobServiceProperties.process(request, res);
}

actions[Operations.Account.GET_BLOB_SERVICE_PROPERTIES] = (request, res) => {
    getBlobServiceProperties.process(request, res);
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