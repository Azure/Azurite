import Operation from "../generated/artifacts/operation";
import { BlobSASPermission } from "./BlobSASPermissions";
import { ContainerSASPermission } from "./ContainerSASPermissions";

export class OperationBlobSASPermission {
  constructor(public readonly permission: string = "") { }

  public validate(permissions: string): boolean {
    return this.validatePermissions(permissions);
  }

  public validatePermissions(permissions: string): boolean {
    // Only blob batch operation allows Any permissions.
    if (this.permission === ContainerSASPermission.Any) {
      return permissions.toString() !== "";
    }

    for (const p of this.permission) {
      if (permissions.toString().includes(p)) {
        return true;
      }
    }
    return false;
  }
}

// See https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-a-service-sas
// Blob Service SAS Permissions for blob level
export const OPERATION_BLOB_SAS_BLOB_PERMISSIONS = new Map<
  Operation,
  OperationBlobSASPermission
>();

OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Service_SetProperties,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Service_GetProperties,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Service_GetStatistics,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Service_ListContainersSegment,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Service_GetAccountInfo,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Service_GetAccountInfoWithHead,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_Create,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_GetProperties,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_GetPropertiesWithHead,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_Delete,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_SetMetadata,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_GetAccessPolicy,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_SetAccessPolicy,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_AcquireLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_ReleaseLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_RenewLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_BreakLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_ChangeLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_ListBlobFlatSegment,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_ListBlobHierarchySegment,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_GetAccountInfo,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Container_GetAccountInfoWithHead,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_Download,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_GetProperties,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_Delete,
  new OperationBlobSASPermission(BlobSASPermission.Delete)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_Undelete,
  new OperationBlobSASPermission(BlobSASPermission.Write) // TODO: Not sure
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_SetHTTPHeaders,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_SetMetadata,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_AcquireLease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_ReleaseLease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_RenewLease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_ChangeLease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_BreakLease,
  new OperationBlobSASPermission(
    BlobSASPermission.Delete + BlobSASPermission.Write
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_CreateSnapshot,
  new OperationBlobSASPermission(
    BlobSASPermission.Create + BlobSASPermission.Write
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_StartCopyFromURL,
  // TODO: When destination blob doesn't exist, needs create permission
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_AbortCopyFromURL,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_CopyFromURL,
  // TODO: When destination blob doesn't exist, needs create permission
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_SetTier,
  new OperationBlobSASPermission(BlobSASPermission.Write) // TODO: Not sure
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_GetAccountInfo,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_GetAccountInfoWithHead,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.PageBlob_Create,
  // TODO: When destination blob doesn't exist, needs create permission
  new OperationBlobSASPermission(
    BlobSASPermission.Create + BlobSASPermission.Write
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.PageBlob_UploadPages,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.PageBlob_ClearPages,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.PageBlob_GetPageRanges,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.PageBlob_GetPageRangesDiff,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.PageBlob_Resize,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.PageBlob_UpdateSequenceNumber,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.PageBlob_CopyIncremental,
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.AppendBlob_Create,
  // TODO: When destination blob doesn't exist, needs create permission
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.AppendBlob_AppendBlock,
  new OperationBlobSASPermission(
    BlobSASPermission.Add + BlobSASPermission.Write
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.BlockBlob_Upload,
  // TODO: When destination blob doesn't exist, needs create permission
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.BlockBlob_StageBlock,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.BlockBlob_StageBlockFromURL,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.BlockBlob_CommitBlockList,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.BlockBlob_GetBlockList,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_SetTags,
  new OperationBlobSASPermission(BlobSASPermission.Tag)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Blob_GetTags,
  new OperationBlobSASPermission(BlobSASPermission.Tag)
);

// Blob Service SAS Permissions for container level
export const OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS = new Map<
  Operation,
  OperationBlobSASPermission
>();

OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Service_SetProperties,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Service_GetProperties,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Service_GetStatistics,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Service_ListContainersSegment,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Service_GetAccountInfo,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Service_GetAccountInfoWithHead,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_Create,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_GetProperties,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_GetPropertiesWithHead,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_Delete,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_SetMetadata,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_SubmitBatch,
  new OperationBlobSASPermission(ContainerSASPermission.Any)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_GetAccessPolicy,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_SetAccessPolicy,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_AcquireLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_ReleaseLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_RenewLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_BreakLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_ChangeLease,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_ListBlobFlatSegment,
  new OperationBlobSASPermission(ContainerSASPermission.List)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_FilterBlobs,
  new OperationBlobSASPermission(ContainerSASPermission.Filter)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_ListBlobHierarchySegment,
  new OperationBlobSASPermission(ContainerSASPermission.List)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_GetAccountInfo,
  new OperationBlobSASPermission(ContainerSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Container_GetAccountInfoWithHead,
  new OperationBlobSASPermission(ContainerSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_Download,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_GetProperties,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_Delete,
  new OperationBlobSASPermission(BlobSASPermission.Delete)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_Undelete,
  new OperationBlobSASPermission(BlobSASPermission.Write) // TODO: Not sure
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_SetHTTPHeaders,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_SetMetadata,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_AcquireLease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_ReleaseLease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_RenewLease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_ChangeLease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_BreakLease,
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Delete
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_CreateSnapshot,
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_StartCopyFromURL,
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_AbortCopyFromURL,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_CopyFromURL,
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_SetTier,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_GetAccountInfo,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_GetAccountInfoWithHead,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.PageBlob_Create,
  new OperationBlobSASPermission(
    // TODO: When destination blob doesn't exist, needs create permission
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.PageBlob_UploadPages,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.PageBlob_ClearPages,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.PageBlob_GetPageRanges,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.PageBlob_GetPageRangesDiff,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.PageBlob_Resize,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.PageBlob_UpdateSequenceNumber,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.PageBlob_CopyIncremental,
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.AppendBlob_Create,
  // TODO: Create a new blob must be write
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.AppendBlob_AppendBlock,
  new OperationBlobSASPermission(
    BlobSASPermission.Add + BlobSASPermission.Write
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.BlockBlob_Upload,
  // Create a new blob, must be write
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.BlockBlob_StageBlock,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.BlockBlob_StageBlockFromURL,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.BlockBlob_CommitBlockList,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.BlockBlob_GetBlockList,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_SetTags,
  new OperationBlobSASPermission(BlobSASPermission.Tag)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Blob_GetTags,
  new OperationBlobSASPermission(BlobSASPermission.Tag)
);
