import * as  BbPromise from "bluebird";
import storageManager from "../../core/blob/StorageManager";
import {
  Operations,
  ServiceSAS,
  StorageEntityType,
  Usage
} from "../../core/Constants";
import AbortCopy from "../../validation/blob/AbortCopy";
import AppendBlobConditionalRequestHeaders from "../../validation/blob/AppendBlobConditionalRequestHeaders";
import AppendMaxBlobCommittedBlocks from "../../validation/blob/AppendMaxBlobCommittedBlocks";
import AssociatedSnapshotsDeletion from "../../validation/blob/AssociatedSnapshotsDeletion";
import BlobCommitted from "../../validation/blob/BlobCommitted";
import BlobCreationSize from "../../validation/blob/BlobCreationSize";
import BlobExists from "../../validation/blob/BlobExists";
import BlobLeaseUsage from "../../validation/blob/BlobLeaseUsage";
import BlobName from "../../validation/blob/BlobName";
import BlockList from "../../validation/blob/BlockList";
import BlockPageSize from "../../validation/blob/BlockPageSize";
import CompatibleBlobType from "../../validation/blob/CompatibleBlobType";
import ConditionalRequestHeaders from "../../validation/blob/ConditionalRequestHeaders";
import ConflictingContainer from "../../validation/blob/ConflictingContainer";
import ContainerExists from "../../validation/blob/ContainerExists";
import ContainerLeaseUsage from "../../validation/blob/ContainerLeaseUsage";
import ContainerName from "../../validation/blob/ContainerName";
import ContentLengthExists from "../../validation/blob/ContentLengthExists";
import CopyStatus from "../../validation/blob/CopyStatus";
import IsOfBlobType from "../../validation/blob/IsOfBlobType";
import LeaseActions from "../../validation/blob/LeaseActions";
import LeaseDuration from "../../validation/blob/LeaseDuration";
import LeaseId from "../../validation/blob/LeaseId";
import MD5 from "../../validation/blob/MD5";
import OriginHeader from "../../validation/blob/OriginHeader";
import PageAlignment from "../../validation/blob/PageAlignment";
import PageBlobHeaderSanity from "../../validation/blob/PageBlobHeaderSanity";
import PutBlobHeaders from "../../validation/blob/PutBlobHeaders";
import ServiceProperties from "../../validation/blob/ServiceProperties";
import ServiceSignature from "../../validation/blob/ServiceSignature";
import SupportedBlobType from "../../validation/blob/SupportedBlobType";
import ValidationContext from "../../validation/blob/ValidationContext";
import NumOfSignedIdentifiers from "../../validation/NumOfSignedIdentifiers";

export default (req, res, next) => {
  BbPromise.try(() => {
    const request = req.azuriteRequest || {};
    // const { containerProxy } = storageManager._getCollectionAndContainer(request.containerName);
    const o = storageManager.getCollectionAndContainer(request.containerName);
    const containerProxy = o.containerProxy;
    const blobId = request.parentId || request.id;
    const { blobProxy } = storageManager.getCollectionAndBlob(
      request.containerName,
      blobId
    );
    const validationContext = new ValidationContext(
      request,
      containerProxy,
      blobProxy
    );
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
  valContext.run(ServiceProperties);
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
  valContext.run(ConflictingContainer).run(ContainerName);
};

validations[Operations.Container.DELETE_CONTAINER] = (request, valContext) => {
  valContext
    .run(ContainerExists)
    .run(ContainerLeaseUsage, { usage: Usage.Delete });
};

validations[Operations.Blob.PUT_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(MD5)
    .run(ContainerExists)
    .run(BlobName)
    .run(CompatibleBlobType)
    .run(SupportedBlobType)
    .run(PutBlobHeaders)
    .run(BlobCreationSize)
    .run(BlobLeaseUsage, { usage: Usage.Write })
    .run(ConditionalRequestHeaders, { usage: Usage.Write });
};

validations[Operations.Blob.APPEND_BLOCK] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.ADD })
    .run(BlobExists)
    .run(ContentLengthExists)
    .run(BlockPageSize)
    .run(MD5)
    .run(AppendMaxBlobCommittedBlocks)
    .run(CompatibleBlobType)
    .run(BlobLeaseUsage, { usage: Usage.Write })
    .run(ConditionalRequestHeaders, { usage: Usage.Write })
    .run(AppendBlobConditionalRequestHeaders);
};

validations[Operations.Blob.DELETE_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.DELETE })
    .run(BlobExists)
    .run(AssociatedSnapshotsDeletion, {
      collection: storageManager.db.getCollection(request.containerName)
    })
    .run(BlobLeaseUsage, { usage: Usage.Write })
    .run(ConditionalRequestHeaders, { usage: Usage.Write });
};

validations[Operations.Blob.GET_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.READ })
    .run(BlobExists)
    .run(BlobCommitted)
    .run(Range)
    .run(BlobLeaseUsage, { usage: Usage.Read })
    .run(ConditionalRequestHeaders, { usage: Usage.Read });
};

validations[Operations.Container.LIST_BLOBS] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.LIST })
    .run(ContainerExists);
};

validations[Operations.Blob.PUT_BLOCK] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(ContainerExists)
    .run(ContentLengthExists)
    .run(BlockPageSize)
    .run(MD5)
    .run(CompatibleBlobType)
    .run(BlobLeaseUsage, { usage: Usage.Write });
};

validations[Operations.Blob.PUT_BLOCK_LIST] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(ContainerExists)
    .run(CompatibleBlobType)
    .run(BlockList, { storageManager })
    .run(BlobLeaseUsage, { usage: Usage.Write })
    .run(ConditionalRequestHeaders, { usage: Usage.Write });
};

validations[Operations.Blob.GET_BLOCK_LIST] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.READ })
    .run(ContainerExists)
    .run(BlobExists)
    .run(IsOfBlobType, { entityType: StorageEntityType.BlockBlob })
    .run(BlobLeaseUsage, { usage: Usage.Read });
};

validations[Operations.Blob.SET_BLOB_METADATA] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(ContainerExists)
    .run(BlobExists)
    .run(ConditionalRequestHeaders, { usage: Usage.Write })
    .run(BlobLeaseUsage, { usage: Usage.Write });
};

validations[Operations.Blob.GET_BLOB_METADATA] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.READ })
    .run(ContainerExists)
    .run(BlobExists)
    .run(BlobCommitted)
    .run(BlobLeaseUsage, { usage: Usage.Read })
    .run(ConditionalRequestHeaders, { usage: Usage.Read });
};

validations[Operations.Blob.GET_BLOB_PROPERTIES] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.READ })
    .run(ContainerExists)
    .run(BlobExists)
    .run(BlobCommitted)
    .run(BlobLeaseUsage, { usage: Usage.Read })
    .run(ConditionalRequestHeaders, { usage: Usage.Read });
};

validations[Operations.Blob.SET_BLOB_PROPERTIES] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(ContainerExists)
    .run(BlobExists)
    .run(ConditionalRequestHeaders, { usage: Usage.Write })
    .run(BlobLeaseUsage, { usage: Usage.Write });
};

validations[Operations.Container.SET_CONTAINER_METADATA] = (
  request,
  valContext
) => {
  valContext
    .run(ContainerExists)
    .run(ContainerLeaseUsage, { usage: Usage.Other })
    .run(ConditionalRequestHeaders, { usage: Usage.Write });
};

validations[Operations.Container.GET_CONTAINER_METADATA] = (
  request,
  valContext
) => {
  valContext
    .run(ContainerExists)
    .run(ContainerLeaseUsage, { usage: Usage.Other });
};

validations[Operations.Container.GET_CONTAINER_PROPERTIES] = (
  request,
  valContext
) => {
  valContext
    .run(ContainerExists)
    .run(ContainerLeaseUsage, { usage: Usage.Other });
};

validations[Operations.Blob.PUT_PAGE] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(ContainerExists)
    .run(BlobExists)
    .run(ContentLengthExists)
    .run(IsOfBlobType, { entityType: StorageEntityType.PageBlob })
    .run(MD5)
    .run(BlockPageSize)
    .run(PageAlignment)
    .run(PageBlobHeaderSanity)
    .run(CompatibleBlobType)
    .run(BlobLeaseUsage, { usage: Usage.Write })
    .run(ConditionalRequestHeaders, { usage: Usage.Write });
};

validations[Operations.Blob.GET_PAGE_RANGES] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.READ })
    .run(ContainerExists)
    .run(BlobExists)
    .run(PageAlignment)
    .run(BlobLeaseUsage, { usage: Usage.Read })
    .run(ConditionalRequestHeaders, { usage: Usage.Write });
};

validations[Operations.Container.SET_CONTAINER_ACL] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(ContainerExists)
    .run(NumOfSignedIdentifiers)
    .run(ConditionalRequestHeaders, { usage: Usage.Write })
    .run(ContainerLeaseUsage, { usage: Usage.Other });
};

validations[Operations.Container.GET_CONTAINER_ACL] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.READ })
    .run(ContainerExists)
    .run(ContainerLeaseUsage, { usage: Usage.Other });
};

validations[Operations.Blob.SNAPSHOT_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.CREATE })
    .run(ContainerExists)
    .run(BlobExists)
    .run(ConditionalRequestHeaders, { usage: Usage.Write })
    .run(BlobLeaseUsage, { usage: Usage.Read });
};

validations[Operations.Container.LEASE_CONTAINER] = (request, valContext) => {
  valContext
    .run(ContainerExists)
    .run(LeaseActions)
    .run(LeaseDuration)
    .run(LeaseId)
    .run(ConditionalRequestHeaders, { usage: Usage.Write });
};

validations[Operations.Blob.LEASE_BLOB] = (request, valContext) => {
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(ContainerExists)
    .run(BlobExists)
    .run(LeaseDuration)
    .run(LeaseId)
    .run(ConditionalRequestHeaders, { usage: Usage.Write })
    .run(LeaseActions);
};

validations[Operations.Blob.COPY_BLOB] = (request, valContext) => {
  // Source Validation
  const sourceBlobProxy = storageManager.getCopySourceProxy(request);
  const ret = storageManager.getCollectionAndContainer(
    request.copySourceName().sourceContainerName
  );
  const sourceContainerProxy = ret.containerProxy;
  valContext
    .run(ServiceSignature, { ServiceSAS: ServiceSAS.Blob.WRITE })
    .run(ContainerExists, { containerProxy: sourceContainerProxy })
    .run(BlobExists, { blobProxy: sourceBlobProxy });

  // Target Validation
  valContext
    .run(ContainerExists)
    .run(CompatibleBlobType, {
      request: { entityType: sourceBlobProxy.original.entityType }
    })
    .run(ConditionalRequestHeaders, { usage: Usage.Write })
    .run(CopyStatus);
};

validations[Operations.Blob.ABORT_COPY_BLOB] = (request, valContext) => {
  valContext.run(AbortCopy);
};
