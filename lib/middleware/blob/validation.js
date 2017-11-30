'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../../core/Constants').Operations,
    Usage = require('./../../core/Constants').Usage,
    StorageEntityType = require('./../../core/Constants').StorageEntityType,
    SasOperation = require('./../../core/Constants').ServiceSAS,
    AzuriteContainerRequest = require('./../../model/blob/AzuriteContainerRequest'),
    AzuriteBlobRequest = require('./../../model/blob/AzuriteBlobRequest'),
    sm = require('./../../core/blob/StorageManager'),
    // Validation modules
    ValidationContext = require('./../../validation/blob/ValidationContext'),
    AppendMaxBlobCommittedBlocksVal = require('./../../validation/blob/AppendMaxBlobCommittedBlocks'),
    BlobCreationSizeVal = require('./../../validation/blob/BlobCreationSize'),
    BlockPageSizeVal = require('./../../validation/blob/BlockPageSize'),
    SupportedBlobTypeVal = require('./../../validation/blob/SupportedBlobType'),
    CompatibleBlobTypeVal = require('./../../validation/blob/CompatibleBlobType'),
    MD5Val = require('./../../validation/blob/MD5'),
    ContentLengthExistsVal = require('./../../validation/blob/ContentLengthExists'),
    ContainerExistsVal = require('./../../validation/blob/ContainerExists'),
    BlobExistsVal = require('./../../validation/blob/BlobExists'),
    BlobCommittedVal = require('./../../validation/blob/BlobCommitted'),
    IsOfBlobTypeVal = require('./../../validation/blob/IsOfBlobType'),
    RangeVal = require('./../../validation/blob/Range'),
    PageAlignmentVal = require('./../../validation/blob/PageAlignment'),
    NumOfSignedIdentifiersVal = require('./../../validation/blob/NumOfSignedIdentifiers'),
    PutBlobHeaderVal = require('./../../validation/blob/PutBlobHeaders'),
    ConditionalRequestHeadersVal = require('./../../validation/blob/ConditionalRequestHeaders'),
    AppendBlobConditionalRequestHeadersVal = require('./../../validation/blob/AppendBlobConditionalRequestHeaders'),
    PageBlobHeaderSanityVal = require('./../../validation/blob/PageBlobHeaderSanity'),
    AssociatedSnapshotDeletion = require('./../../validation/blob/AssociatedSnapshotsDeletion'),
    LeaseActionsValidation = require('./../../validation/blob/LeaseActions'),
    LeaseDurationValidation = require('./../../validation/blob/LeaseDuration'),
    LeaseIdValidation = require('./../../validation/blob/LeaseId'),
    ContainerLeaseUsageValidation = require('./../../validation/blob/ContainerLeaseUsage'),
    ConflictingContainerVal = require('./../../validation/blob/ConflictingContainer'),
    BlobLeaseUsageValidation = require('./../../validation/blob/BlobLeaseUsage'),
    BlockListValidation = require('./../../validation/blob/BlockList'),
    AbortCopyValidation = require('./../../validation/blob/AbortCopy'),
    ServiceSignatureValidation = require('./../../validation/blob/ServiceSignature'),
    CopyStatusValidation = require('./../../validation/blob/CopyStatus');

module.exports = (req, res, next) => {
    BbPromise.try(() => {
        const request = req.azuriteRequest || {};
        // const { containerProxy } = sm._getCollectionAndContainer(request.containerName);
        const o = sm._getCollectionAndContainer(request.containerName);
        const containerProxy = o.containerProxy;
        const blobId = request.parentId || request.id;
        const { blobProxy } = sm._getCollectionAndBlob(request.containerName, blobId);
        const validationContext = new ValidationContext({
            request: request,
            containerProxy: containerProxy,
            blobProxy: blobProxy
        })
        validations[req.azuriteOperation](request, validationContext);
        next();
        // Refactor me: Move this to bin/azurite (exception needs to carry res object), and handle entire exception handling there
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const validations = {};

validations[undefined] = () => {
    // NO VALIDATIONS (this is an unimplemented call)
}

validations[Operations.Account.LIST_CONTAINERS] = (request, valContext) => {
    // NO VALIDATIONS
}

validations[Operations.Container.CREATE_CONTAINER] = (request, valContext) => {
    valContext
        .run(ConflictingContainerVal);
}

validations[Operations.Container.DELETE_CONTAINER] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(ContainerLeaseUsageValidation, { usage: Usage.Delete });
}

validations[Operations.Blob.PUT_BLOB] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.CREATE })
        .run(MD5Val)
        .run(ContainerExistsVal)
        .run(CompatibleBlobTypeVal)
        .run(SupportedBlobTypeVal)
        .run(PutBlobHeaderVal)
        .run(BlobCreationSizeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
}

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
}

validations[Operations.Blob.DELETE_BLOB] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.DELETE })
        .run(BlobExistsVal)
        .run(AssociatedSnapshotDeletion, { collection: sm.db.getCollection(request.containerName) })
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
}

validations[Operations.Blob.GET_BLOB] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
        .run(BlobExistsVal)
        .run(BlobCommittedVal)
        .run(RangeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Read })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Read })
}

validations[Operations.Container.LIST_BLOBS] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.LIST })
        .run(ContainerExistsVal);
}

validations[Operations.Blob.PUT_BLOCK] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
        .run(ContainerExistsVal)
        .run(ContentLengthExistsVal)
        .run(BlockPageSizeVal)
        .run(MD5Val)
        .run(CompatibleBlobTypeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
}

validations[Operations.Blob.PUT_BLOCK_LIST] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
        .run(ContainerExistsVal)
        .run(CompatibleBlobTypeVal)
        .run(BlockListValidation, { storageManager: sm })
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
}

validations[Operations.Blob.GET_BLOCK_LIST] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(IsOfBlobTypeVal, { entityType: StorageEntityType.BlockBlob })
        .run(BlobLeaseUsageValidation, { usage: Usage.Read });
}

validations[Operations.Blob.SET_BLOB_METADATA] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(BlobLeaseUsageValidation, { usage: Usage.Write });
}

validations[Operations.Blob.GET_BLOB_METADATA] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(BlobCommittedVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Read })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Read });
}

validations[Operations.Blob.GET_BLOB_PROPERTIES] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(BlobCommittedVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Read })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Read });
}

validations[Operations.Blob.SET_BLOB_PROPERTIES] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(BlobLeaseUsageValidation, { usage: Usage.Write });
}

validations[Operations.Container.SET_CONTAINER_METADATA] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(ContainerLeaseUsageValidation, { usage: Usage.Other })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
}

validations[Operations.Container.GET_CONTAINER_METADATA] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
}

validations[Operations.Container.GET_CONTAINER_PROPERTIES] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
}

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
}

validations[Operations.Blob.GET_PAGE_RANGES] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(PageAlignmentVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Read })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
}

validations[Operations.Container.SET_CONTAINER_ACL] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
        .run(ContainerExistsVal)
        .run(NumOfSignedIdentifiersVal)
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
}

validations[Operations.Container.GET_CONTAINER_ACL] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.READ })
        .run(ContainerExistsVal)
        .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
}

validations[Operations.Blob.SNAPSHOT_BLOB] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.CREATE })
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(BlobLeaseUsageValidation, { usage: Usage.Read });
}

validations[Operations.Container.LEASE_CONTAINER] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(LeaseActionsValidation)
        .run(LeaseDurationValidation)
        .run(LeaseIdValidation)
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
}

validations[Operations.Blob.LEASE_BLOB] = (request, valContext) => {
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(LeaseDurationValidation)
        .run(LeaseIdValidation)
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(LeaseActionsValidation);
}

validations[Operations.Blob.COPY_BLOB] = (request, valContext) => {
    // Source Validation
    const sourceBlobProxy = sm._getCopySourceProxy(request);
    const ret = sm._getCollectionAndContainer((request.copySourceName()).sourceContainerName),
        sourceContainerProxy = ret.containerProxy;
    valContext
        .run(ServiceSignatureValidation, { sasOperation: SasOperation.Blob.WRITE })
        .run(ContainerExistsVal, { containerProxy: sourceContainerProxy })
        .run(BlobExistsVal, { blobProxy: sourceBlobProxy });

    // Target Validation
    valContext
        .run(ContainerExistsVal)
        .run(CompatibleBlobTypeVal, { request: { entityType: sourceBlobProxy.original.entityType } })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(CopyStatusValidation);
}

validations[Operations.Blob.ABORT_COPY_BLOB] = (request, valContext) => {
    valContext
        .run(AbortCopyValidation);
}