import BbPromise from "bluebird";
import { Operations } from "../../core/Constants";
import OriginHeader from "../../validation/blob/OriginHeader";

export default (req, res, next) => {
  BbPromise.try(() => {
    const request = req.azuriteRequest || {};
    // const { containerProxy } = sm._getCollectionAndContainer(request.containerName);
    const o = sm._getCollectionAndContainer(request.containerName);
    const containerProxy = o.containerProxy;
    const blobId = request.parentId || request.id;
    const { blobProxy } = sm._getCollectionAndBlob(
      request.containerName,
      blobId
    );
    const validationContext = new ValidationContext({
      request,
      containerProxy,
      blobProxy
    });
    validations[req.azuriteOperation](request, validationContext);
    next();
    // Refactor me: Move this to bin/azurite (exception needs to carry res object), and handle entire exception handling there
  }).catch(e => {
    res.status(e.statusCode || 500).send(e.message);
    if (!e.statusCode) {
      throw e;
    }
  });
};

const validations = {};

validations[Operations.Account.PREFLIGHT_BLOB_REQUEST] = (
  request,
  valContext
) => {
  valContext.run(OriginHeader);
};

validations[Operations.Account.SET_BLOB_SERVICE_PROPERTIES] = (
  request,
  valContext
) => {
  valContext.run(ServicePropertiesValidation);
};

validations[Operations.Account.GET_BLOB_SERVICE_PROPERTIES] = (
  request,
  valContext
) => {
  // NO VALIDATIONS
};

validations[Operations.Account.LIST_CONTAINERS] = (request, valContext) => {
  // NO VALIDATIONS
};

validations[Operations.Container.CREATE_CONTAINER] = (request, valContext) => {
  valContext.run(ConflictingContainerVal).run(ContainerNameValidation);
};

validations[Operations.Container.DELETE_CONTAINER] = (request, valContext) => {
  valContext
    .run(ContainerExistsVal)
    .run(ContainerLeaseUsageValidation, { usage: Usage.Delete });
};

validations[Operations.Blob.PUT_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(MD5Val)
    .run(ContainerExistsVal)
    .run(BlobNameVal)
    .run(CompatibleBlobTypeVal)
    .run(SupportedBlobTypeVal)
    .run(PutBlobHeaderVal)
    .run(BlobCreationSizeVal)
    .run(BlobLeaseUsageValidation, { usage: Usage.Write })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
};

validations[Operations.Blob.APPEND_BLOCK] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.ADD })
    .run(BlobExistsVal)
    .run(ContentLengthExistsVal)
    .run(BlockPageSizeVal)
    .run(MD5Val)
    .run(AppendMaxBlobCommittedBlocksVal)
    .run(CompatibleBlobTypeVal)
    .run(BlobLeaseUsageValidation, { usage: Usage.Write })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
    .run(AppendBlobConditionalRequestHeadersVal);
};

validations[Operations.Blob.DELETE_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.DELETE })
    .run(BlobExistsVal)
    .run(AssociatedSnapshotDeletion, {
      collection: sm.db.getCollection(request.containerName)
    })
    .run(BlobLeaseUsageValidation, { usage: Usage.Write })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
};

validations[Operations.Blob.GET_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
    .run(BlobExistsVal)
    .run(BlobCommittedVal)
    .run(RangeVal)
    .run(BlobLeaseUsageValidation, { usage: Usage.Read })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Read });
};

validations[Operations.Container.LIST_BLOBS] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.LIST })
    .run(ContainerExistsVal);
};

validations[Operations.Blob.PUT_BLOCK] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(ContainerExistsVal)
    .run(ContentLengthExistsVal)
    .run(BlockPageSizeVal)
    .run(MD5Val)
    .run(CompatibleBlobTypeVal)
    .run(BlobLeaseUsageValidation, { usage: Usage.Write });
};

validations[Operations.Blob.PUT_BLOCK_LIST] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(ContainerExistsVal)
    .run(CompatibleBlobTypeVal)
    .run(BlockListValidation, { storageManager: sm })
    .run(BlobLeaseUsageValidation, { usage: Usage.Write })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
};

validations[Operations.Blob.GET_BLOCK_LIST] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(IsOfBlobTypeVal, { entityType: StorageEntityType.BlockBlob })
    .run(BlobLeaseUsageValidation, { usage: Usage.Read });
};

validations[Operations.Blob.SET_BLOB_METADATA] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
    .run(BlobLeaseUsageValidation, { usage: Usage.Write });
};

validations[Operations.Blob.GET_BLOB_METADATA] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(BlobCommittedVal)
    .run(BlobLeaseUsageValidation, { usage: Usage.Read })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Read });
};

validations[Operations.Blob.GET_BLOB_PROPERTIES] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(BlobCommittedVal)
    .run(BlobLeaseUsageValidation, { usage: Usage.Read })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Read });
};

validations[Operations.Blob.SET_BLOB_PROPERTIES] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
    .run(BlobLeaseUsageValidation, { usage: Usage.Write });
};

validations[Operations.Container.SET_CONTAINER_METADATA] = (
  request,
  valContext
) => {
  valContext
    .run(ContainerExistsVal)
    .run(ContainerLeaseUsageValidation, { usage: Usage.Other })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
};

validations[Operations.Container.GET_CONTAINER_METADATA] = (
  request,
  valContext
) => {
  valContext
    .run(ContainerExistsVal)
    .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
};

validations[Operations.Container.GET_CONTAINER_PROPERTIES] = (
  request,
  valContext
) => {
  valContext
    .run(ContainerExistsVal)
    .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
};

validations[Operations.Blob.PUT_PAGE] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(ContentLengthExistsVal)
    .run(IsOfBlobTypeVal, { entityType: StorageEntityType.PageBlob })
    .run(MD5Val)
    .run(BlockPageSizeVal)
    .run(PageAlignmentVal)
    .run(PageBlobHeaderSanityVal)
    .run(CompatibleBlobTypeVal)
    .run(BlobLeaseUsageValidation, { usage: Usage.Write })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
};

validations[Operations.Blob.GET_PAGE_RANGES] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(PageAlignmentVal)
    .run(BlobLeaseUsageValidation, { usage: Usage.Read })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
};

validations[Operations.Container.SET_CONTAINER_ACL] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(ContainerExistsVal)
    .run(NumOfSignedIdentifiersVal)
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
    .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
};

validations[Operations.Container.GET_CONTAINER_ACL] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
    .run(ContainerExistsVal)
    .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
};

validations[Operations.Blob.SNAPSHOT_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.CREATE })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
    .run(BlobLeaseUsageValidation, { usage: Usage.Read });
};

validations[Operations.Container.LEASE_CONTAINER] = (request, valContext) => {
  valContext
    .run(ContainerExistsVal)
    .run(LeaseActionsValidation)
    .run(LeaseDurationValidation)
    .run(LeaseIdValidation)
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
};

validations[Operations.Blob.LEASE_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(ContainerExistsVal)
    .run(BlobExistsVal)
    .run(LeaseDurationValidation)
    .run(LeaseIdValidation)
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
    .run(LeaseActionsValidation);
};

validations[Operations.Blob.COPY_BLOB] = (request, valContext) => {
  // Source Validation
  const sourceBlobProxy = sm._getCopySourceProxy(request);
  const ret = sm._getCollectionAndContainer(
      request.copySourceName().sourceContainerName
    ),
    sourceContainerProxy = ret.containerProxy;
  valContext
    .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
    .run(ContainerExistsVal, { containerProxy: sourceContainerProxy })
    .run(BlobExistsVal, { blobProxy: sourceBlobProxy });

  // Target Validation
  valContext
    .run(ContainerExistsVal)
    .run(CompatibleBlobTypeVal, {
      request: { entityType: sourceBlobProxy.original.entityType }
    })
    .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
    .run(CopyStatusValidation);
};

validations[Operations.Blob.ABORT_COPY_BLOB] = (request, valContext) => {
  valContext.run(AbortCopyValidation);
};
