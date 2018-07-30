import BbPromise from "bluebird";
import CreateContainer from "../../actions/blob/CreateContainer";
import DeleteContainer from "../../actions/blob/DeleteContainer";
import PreflightBlobRequest from "../../actions/blob/PreflightBlobRequest";
import PutAppendBlock from "../../actions/blob/PutAppendBlock";
import PutBlob from "../../actions/blob/PutBlob";
import SetBlobServiceProperties from "../../actions/blob/SetBlobServiceProperties";
import { Operations } from "../../core/Constants";
import GetBlobServiceProperties from "../../actions/blob/GetBlobServiceProperties";
import ListContainers from "../../actions/blob/ListContainers";

export default (req, res) => {
  BbPromise.try(() => {
    actions[req.azuriteOperation](req.azuriteRequest, res);
  }).catch(e => {
    res.status(e.statusCode || 500).send(e.message);
    if (!e.statusCode) {
      throw e;
    }
  });
};

const actions = {};

actions[Operations.Account.PREFLIGHT_BLOB_REQUEST] = (request, res) => {
  PreflightBlobRequest.process(request, res);
};

actions[Operations.Account.SET_BLOB_SERVICE_PROPERTIES] = (request, res) => {
  SetBlobServiceProperties.process(request, res);
};

actions[Operations.Account.GET_BLOB_SERVICE_PROPERTIES] = (request, res) => {
  GetBlobServiceProperties.process(request, res);
};

actions[Operations.Account.LIST_CONTAINERS] = (request, res) => {
  ListContainers.process(request, res);
};

actions[Operations.Container.CREATE_CONTAINER] = (request, res) => {
  CreateContainer.process(request, res);
};

actions[Operations.Container.DELETE_CONTAINER] = (request, res) => {
  DeleteContainer.process(request, res);
};

actions[Operations.Blob.PUT_BLOB] = (request, res) => {
  PutBlob.process(request, res);
};

actions[Operations.Blob.APPEND_BLOCK] = (request, res) => {
  PutAppendBlock.process(request, res);
};

actions[Operations.Blob.DELETE_BLOB] = (request, res) => {
  DeleteBlob.process(request, res);
};

actions[Operations.Blob.GET_BLOB] = (request, res) => {
  GetBlob.process(request, res);
};

actions[Operations.Container.LIST_BLOBS] = (request, res) => {
  ListBlobs.process(request, res);
};

actions[Operations.Blob.PUT_BLOCK] = (request, res) => {
  PutBlock.process(request, res);
};

actions[Operations.Blob.PUT_BLOCK_LIST] = (request, res) => {
  PutBlockList.process(request, res);
};

actions[Operations.Blob.GET_BLOCK_LIST] = (request, res) => {
  GetBlockList.process(request, res);
};

actions[Operations.Blob.SET_BLOB_METADATA] = (request, res) => {
  SetBlobMetadata.process(request, res);
};

actions[Operations.Blob.GET_BLOB_METADATA] = (request, res) => {
  GetBlobMetadata.process(request, res);
};

actions[Operations.Blob.GET_BLOB_PROPERTIES] = (request, res) => {
  GetBlobProperties.process(request, res);
};

actions[Operations.Blob.SET_BLOB_PROPERTIES] = (request, res) => {
  SetBlobProperties.process(request, res);
};

actions[Operations.Container.SET_CONTAINER_METADATA] = (request, res) => {
  SetContainerMetadata.process(request, res);
};

actions[Operations.Container.GET_CONTAINER_METADATA] = (request, res) => {
  GetContainerMetadata.process(request, res);
};

actions[Operations.Container.GET_CONTAINER_PROPERTIES] = (request, res) => {
  GetContainerProperties.process(request, res);
};

actions[Operations.Blob.PUT_PAGE] = (request, res) => {
  PutPage.process(request, res);
};

actions[Operations.Blob.GET_PAGE_RANGES] = (request, res) => {
  GetPageRanges.process(request, res);
};

actions[Operations.Container.SET_CONTAINER_ACL] = (request, res) => {
  GetContainerAcl.process(request, res);
};

actions[Operations.Container.GET_CONTAINER_ACL] = (request, res) => {
  GetContainerAcl.process(request, res);
};

actions[Operations.Blob.SNAPSHOT_BLOB] = (request, res) => {
  SnapshotBlob.process(request, res);
};

actions[Operations.Container.LEASE_CONTAINER] = (request, res) => {
  LeaseContainer.process(request, res);
};

actions[Operations.Blob.LEASE_BLOB] = (request, res) => {
  LeaseBlob.process(request, res);
};

actions[Operations.Blob.COPY_BLOB] = (request, res) => {
  CopyBlob.process(request, res);
};

actions[Operations.Blob.ABORT_COPY_BLOB] = (request, res) => {
  AbortCopyBlob.process(request, res);
};
