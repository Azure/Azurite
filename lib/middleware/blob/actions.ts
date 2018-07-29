const BbPromise = from "bluebird"),
  Operations = from "./../../core/Constants").Operations,
  // Actions
  createContainer = from "./../../actions/blob/CreateContainer"),
  deleteBlob = from "./../../actions/blob/DeleteBlob"),
  deleteContainer = from "./../../actions/blob/DeleteContainer"),
  getBlob = from "./../../actions/blob/GetBlob"),
  getBlobMetadata = from "./../../actions/blob/GetBlobMetadata"),
  getBlobProperties = from "./../../actions/blob/GetBlobProperties"),
  getBlockList = from "./../../actions/blob/GetBlockList"),
  getContainerAcl = from "./../../actions/blob/GetContainerAcl"),
  getContainerMetadata = from "./../../actions/blob/GetContainerMetadata"),
  getContainerProperties = from "./../../actions/blob/GetContainerProperties"),
  getPageRanges = from "./../../actions/blob/GetPageRanges"),
  leaseBlob = from "./../../actions/blob/LeaseBlob"),
  leaseContainer = from "./../../actions/blob/LeaseContainer"),
  listBlobs = from "./../../actions/blob/ListBlobs"),
  listContainers = from "./../../actions/blob/ListContainers"),
  putAppendBlock = from "./../../actions/blob/PutAppendBlock"),
  putBlob = from "./../../actions/blob/PutBlob"),
  putBlock = from "./../../actions/blob/PutBlock"),
  putBlockList = from "./../../actions/blob/PutBlockList"),
  putPage = from "./../../actions/blob/PutPage"),
  setBlobMetadata = from "./../../actions/blob/SetBlobMetadata"),
  setBlobProperties = from "./../../actions/blob/SetBlobProperties"),
  setBlobServiceProperties = from "./../../actions/blob/SetBlobServiceProperties"),
  getBlobServiceProperties = from "./../../actions/blob/GetBlobServiceProperties"),
  preflightBlobRequest = from "./../../actions/blob/PreflightBlobRequest"),
  setContainerAcl = from "./../../actions/blob/SetContainerAcl"),
  setContainerMetadata = from "./../../actions/blob/SetContainerMetadata"),
  snapshotBlob = from "./../../actions/blob/SnapshotBlob"),
  copyBlob = from "./../../actions/blob/CopyBlob"),
  abortCopyBlob = from "./../../actions/blob/AbortCopyBlob");

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

actions[undefined] = (request, res) => {
  res.status(501).send("Not Implemented yet.");
};

actions[Operations.Account.PREFLIGHT_BLOB_REQUEST] = (request, res) => {
  preflightBlobRequest.process(request, res);
};

actions[Operations.Account.SET_BLOB_SERVICE_PROPERTIES] = (request, res) => {
  setBlobServiceProperties.process(request, res);
};

actions[Operations.Account.GET_BLOB_SERVICE_PROPERTIES] = (request, res) => {
  getBlobServiceProperties.process(request, res);
};

actions[Operations.Account.LIST_CONTAINERS] = (request, res) => {
  listContainers.process(request, res);
};

actions[Operations.Container.CREATE_CONTAINER] = (request, res) => {
  createContainer.process(request, res);
};

actions[Operations.Container.DELETE_CONTAINER] = (request, res) => {
  deleteContainer.process(request, res);
};

actions[Operations.Blob.PUT_BLOB] = (request, res) => {
  putBlob.process(request, res);
};

actions[Operations.Blob.APPEND_BLOCK] = (request, res) => {
  putAppendBlock.process(request, res);
};

actions[Operations.Blob.DELETE_BLOB] = (request, res) => {
  deleteBlob.process(request, res);
};

actions[Operations.Blob.GET_BLOB] = (request, res) => {
  getBlob.process(request, res);
};

actions[Operations.Container.LIST_BLOBS] = (request, res) => {
  listBlobs.process(request, res);
};

actions[Operations.Blob.PUT_BLOCK] = (request, res) => {
  putBlock.process(request, res);
};

actions[Operations.Blob.PUT_BLOCK_LIST] = (request, res) => {
  putBlockList.process(request, res);
};

actions[Operations.Blob.GET_BLOCK_LIST] = (request, res) => {
  getBlockList.process(request, res);
};

actions[Operations.Blob.SET_BLOB_METADATA] = (request, res) => {
  setBlobMetadata.process(request, res);
};

actions[Operations.Blob.GET_BLOB_METADATA] = (request, res) => {
  getBlobMetadata.process(request, res);
};

actions[Operations.Blob.GET_BLOB_PROPERTIES] = (request, res) => {
  getBlobProperties.process(request, res);
};

actions[Operations.Blob.SET_BLOB_PROPERTIES] = (request, res) => {
  setBlobProperties.process(request, res);
};

actions[Operations.Container.SET_CONTAINER_METADATA] = (request, res) => {
  setContainerMetadata.process(request, res);
};

actions[Operations.Container.GET_CONTAINER_METADATA] = (request, res) => {
  getContainerMetadata.process(request, res);
};

actions[Operations.Container.GET_CONTAINER_PROPERTIES] = (request, res) => {
  getContainerProperties.process(request, res);
};

actions[Operations.Blob.PUT_PAGE] = (request, res) => {
  putPage.process(request, res);
};

actions[Operations.Blob.GET_PAGE_RANGES] = (request, res) => {
  getPageRanges.process(request, res);
};

actions[Operations.Container.SET_CONTAINER_ACL] = (request, res) => {
  setContainerAcl.process(request, res);
};

actions[Operations.Container.GET_CONTAINER_ACL] = (request, res) => {
  getContainerAcl.process(request, res);
};

actions[Operations.Blob.SNAPSHOT_BLOB] = (request, res) => {
  snapshotBlob.process(request, res);
};

actions[Operations.Container.LEASE_CONTAINER] = (request, res) => {
  leaseContainer.process(request, res);
};

actions[Operations.Blob.LEASE_BLOB] = (request, res) => {
  leaseBlob.process(request, res);
};

actions[Operations.Blob.COPY_BLOB] = (request, res) => {
  copyBlob.process(request, res);
};

actions[Operations.Blob.ABORT_COPY_BLOB] = (request, res) => {
  abortCopyBlob.process(request, res);
};
