import Operation from "../generated/artifacts/operation";
import { AccountSASPermission } from "../../common/authentication/AccountSASPermissions";
import { AccountSASResourceType } from "../../common/authentication/AccountSASResourceTypes";
import { AccountSASService } from "../../common/authentication/AccountSASServices";
import { OperationAccountSASPermission } from "../../blob/authentication/OperationAccountSASPermission";

// See https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas
// TODO: Check all required operations
const OPERATION_ACCOUNT_SAS_PERMISSIONS = new Map<
  Operation,
  OperationAccountSASPermission
>();
/////////////////////////////////       DataLake       ////////////////////////////////////

//////////////////////////////////Paths Operations//////////////////////////////
OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_Create,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Create + AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_AppendData,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Create + AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_FlushData,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_Lease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_SetAccessControl,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_SetAccessControlRecursive,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_SetExpiry,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_Update,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_Undelete,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write + AccountSASPermission.Create
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_Read,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_GetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Path_Delete,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Delete
  )
);

//////////////////////////////////FileSystem Operations//////////////////////////////

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.FileSystem_Create,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Create
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.FileSystem_SetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.FileSystem_GetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.FileSystem_ListPaths,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.List
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.FileSystem_ListBlobFlatSegment,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.List
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.FileSystem_ListBlobHierarchySegment,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.List
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.FileSystem_Delete,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Delete
  )
);

//////////////////////////////////Service Operations//////////////////////////////

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_ListFileSystems,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Delete
  )
);

export default OPERATION_ACCOUNT_SAS_PERMISSIONS;
