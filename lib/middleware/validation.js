'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../Constants').Operations,
    Usage = require('./../Constants').Usage,
    StorageEntityType = require('./../Constants').StorageEntityType,
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
        const { containerProxy } = sm._getCollectionAndContainer(request.containerName);
        const { blobProxy } = sm._getCollectionAndBlob({ containerName: request.containerName, blobName: request.publicName() });
        const validatioContext = new ValidationContext({
            request: request,
            containerProxy: containerProxy,
            blobProxy: blobProxy
        })
        validations[req.azuriteOperation](req.azuriteRequest, validationContext);
        next();
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const validations = {};
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

validations[Operations.Blob.DELETE_BLOB] = (request, valContext) => {
    valContext
        .run(BlobExistsVal)
        .run(AssociatedSnapshotDeletion, { collection: this.db.getCollection(request.containerName) })
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
}

validations[Operations.Blob.GET_BLOB] = (request, valContext) => {
    valContext
        .run(BlobExistsVal)
        .run(BlobCommittedVal)
        .run(RangeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Read })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Read })
}

validations[Operations.Container.LIST_BLOBS] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal);
}

validations[Operations.Blob.PUT_BLOCK] = (request, valContext) => {
    valContext
        .run(ContentLengthExistsVal)
        .run(BlockPageSizeVal)
        .run(ContainerExistsVal)
        .run(MD5Val)
        .run(CompatibleBlobTypeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
}

validations[Operations.Blob.PUT_BLOCK_LIST] = (request, valContext) => {
    const blockList = request.azuritePayload;
    for (const block of blockList) {
        const blockName = `${request.containerName}-${request.blobName}-${block.id}`;
        valContext.run(BlobExistsVal, {
            blobProxy: { publicName: () => { return blockName } }
        });
    }
    valContext
        .run(ContainerExistsVal)
        .run(CompatibleBlobTypeVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Write })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
}

validations[Operations.Blob.GET_BLOCK_LIST] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(SupportedBlobTypeVal)
        .run(IsOfBlobTypeVal, { entityType: StorageEntityType.BlockBlob })
        .run(BlobLeaseUsageValidation, { usage: Usage.Read });
}

validations[Operations.Blob.SET_BLOB_METADATA] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(BlobLeaseUsageValidation, { usage: Usage.Write });
}

validations[Operations.Blob.GET_BLOB_METADATA] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(BlobCommittedVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Read })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Read });
}

validations[Operations.Blob.SET_BLOB_PROPERTIES] = (request, valContext) => {
    valContext
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
        .run(ContainerExistsVal)
        .run(BlobExistsVal)
        .run(PageAlignmentVal)
        .run(BlobLeaseUsageValidation, { usage: Usage.Read })
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write });
}

validations[Operations.Container.SET_CONTAINER_ACL] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(NumOfSignedIdentifiersVal)
        .run(ConditionalRequestHeadersVal, { usage: Usage.Write })
        .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
}

validations[Operations.Container.GET_CONTAINER_ACL] = (request, valContext) => {
    valContext
        .run(ContainerExistsVal)
        .run(ContainerLeaseUsageValidation, { usage: Usage.Other });
}

validations[Operations.Blob.SNAPSHOT_BLOB] = (request, valContext) => {
    valContext
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