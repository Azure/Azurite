import Operation from "../generated/artifacts/operation";
import { BlobSASPermission } from "../../blob/authentication/BlobSASPermissions";
import { ContainerSASPermission } from "../../blob/authentication/ContainerSASPermissions";
import { OperationBlobSASPermission } from "../../blob/authentication/OperationBlobSASPermission";

// See https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-a-service-sas
// Blob Service SAS Permissions for blob level
export const OPERATION_BLOB_SAS_BLOB_PERMISSIONS = new Map<
  Operation,
  OperationBlobSASPermission
>();
/////////////////////////////////       DataLake       ////////////////////////////////////

//////////////////////////////////Paths Operations//////////////////////////////
//Since it is used in rename as well it needs write
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_Create,
  new OperationBlobSASPermission(
    BlobSASPermission.Create + BlobSASPermission.Write
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_AppendData,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_FlushData,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_Lease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_SetAccessControl,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_SetAccessControlRecursive,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_SetExpiry,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_Update,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_Undelete,
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_Read,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_GetProperties,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Path_Delete,
  new OperationBlobSASPermission(BlobSASPermission.Delete)
);
//////////////////////////////////FileSystem Operations//////////////////////////////

OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.FileSystem_Create,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.FileSystem_SetProperties,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.FileSystem_GetProperties,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.FileSystem_ListPaths,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.FileSystem_ListBlobFlatSegment,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.FileSystem_ListBlobHierarchySegment,
  new OperationBlobSASPermission()
);
OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.FileSystem_Delete,
  new OperationBlobSASPermission()
);
//////////////////////////////////Service Operations//////////////////////////////

OPERATION_BLOB_SAS_BLOB_PERMISSIONS.set(
  Operation.Service_ListFileSystems,
  new OperationBlobSASPermission()
);

// Blob Service SAS Permissions for container level
export const OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS = new Map<
  Operation,
  OperationBlobSASPermission
>();
/////////////////////////////////       DataLake       ////////////////////////////////////

//////////////////////////////////Paths Operations//////////////////////////////
//Since it is used in rename as well it needs write
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_Create,
  new OperationBlobSASPermission(
    BlobSASPermission.Create + BlobSASPermission.Write
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_AppendData,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_FlushData,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_Lease,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_SetAccessControl,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_SetAccessControlRecursive,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_SetExpiry,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_Update,
  new OperationBlobSASPermission(BlobSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_Undelete,
  new OperationBlobSASPermission(
    BlobSASPermission.Write + BlobSASPermission.Create
  )
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_Read,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_GetProperties,
  new OperationBlobSASPermission(BlobSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Path_Delete,
  new OperationBlobSASPermission(BlobSASPermission.Delete)
);
//////////////////////////////////FileSystem Operations//////////////////////////////

OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.FileSystem_Create,
  new OperationBlobSASPermission(ContainerSASPermission.Create)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.FileSystem_SetProperties,
  new OperationBlobSASPermission(ContainerSASPermission.Write)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.FileSystem_GetProperties,
  new OperationBlobSASPermission(ContainerSASPermission.Read)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.FileSystem_ListPaths,
  new OperationBlobSASPermission(ContainerSASPermission.List)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.FileSystem_ListBlobFlatSegment,
  new OperationBlobSASPermission(ContainerSASPermission.List)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.FileSystem_ListBlobHierarchySegment,
  new OperationBlobSASPermission(ContainerSASPermission.List)
);
OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.FileSystem_Delete,
  new OperationBlobSASPermission(ContainerSASPermission.Delete)
);
//////////////////////////////////Service Operations//////////////////////////////

OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.set(
  Operation.Service_ListFileSystems,
  new OperationBlobSASPermission()
);
