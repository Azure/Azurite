import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices
} from "@azure/storage-blob";

import Operation from "../generated/artifacts/operation";
import { AccountSASPermission } from "./AccountSASPermissions";
import { AccountSASResourceType } from "./AccountSASResourceTypes";
import { AccountSASService } from "./AccountSASServices";

export class OperationAccountSASPermission {
  constructor(
    public readonly service: string,
    public readonly resourceType: string,
    public readonly permission: string
  ) {}

  public validate(
    services: AccountSASServices | string,
    resourceTypes: AccountSASResourceTypes | string,
    permissions: AccountSASPermissions | string
  ): boolean {
    return (
      this.validateServices(services) &&
      this.validateResourceTypes(resourceTypes) &&
      this.validatePermissions(permissions)
    );
  }

  public validateServices(services: AccountSASServices | string): boolean {
    return services.toString().includes(this.service);
  }

  public validateResourceTypes(
    resourceTypes: AccountSASResourceTypes | string
  ): boolean {
    return resourceTypes.toString().includes(this.resourceType);
  }

  public validatePermissions(
    permissions: AccountSASPermissions | string
  ): boolean {
    for (const p of this.permission) {
      if (permissions.toString().includes(p)) {
        return true;
      }
    }
    return false;
  }
}

// See https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas
// TODO: Check all required operations
const OPERATION_ACCOUNT_SAS_PERMISSIONS = new Map<
  Operation,
  OperationAccountSASPermission
>();

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_GetAccountInfo,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_GetAccountInfoWithHead,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_GetAccountInfo,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_GetAccountInfoWithHead,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_GetAccountInfo,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_GetAccountInfoWithHead,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_ListContainersSegment,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.List
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_GetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_SetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_GetStatistics,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_Create,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Create + AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_SetAccessPolicy,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    "" // NOT ALLOWED
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_GetAccessPolicy,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    "" // NOT ALLOWED
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_GetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_GetPropertiesWithHead,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Read
  )
);

// TODO: Get container metadata is missing in swagger

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_SetMetadata,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_BreakLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Write + AccountSASPermission.Delete
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_RenewLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_ChangeLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_AcquireLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_ReleaseLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_Delete,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.Delete
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_ListBlobHierarchySegment,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.List
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Container_ListBlobFlatSegment,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Container,
    AccountSASPermission.List
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.BlockBlob_Upload,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    // Create permission is only available for non existing block blob. Handle this scenario separately
    AccountSASPermission.Write + AccountSASPermission.Create
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.PageBlob_Create,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    // Create permission is only available for non existing page blob. Handle this scenario separately
    AccountSASPermission.Write + AccountSASPermission.Create
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.AppendBlob_Create,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    // Create permission is only available for non existing append blob. Handle this scenario separately
    AccountSASPermission.Write + AccountSASPermission.Create
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_Download,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_GetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_SetHTTPHeaders,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

// TODO: Get blob metadata is missing in swagger

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_GetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_SetMetadata,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_Delete,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Delete
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_BreakLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Delete + AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_RenewLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_ChangeLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_AcquireLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_ReleaseLease,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_CreateSnapshot,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write + AccountSASPermission.Create
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_StartCopyFromURL,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    // If destination is an existing blob, create permission is not enough
    AccountSASPermission.Write + AccountSASPermission.Create
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.PageBlob_CopyIncremental,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write + AccountSASPermission.Create
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Blob_AbortCopyFromURL,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.BlockBlob_StageBlock,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.BlockBlob_CommitBlockList,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.BlockBlob_GetBlockList,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.PageBlob_UploadPages,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.PageBlob_GetPageRanges,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.PageBlob_GetPageRangesDiff,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.AppendBlob_AppendBlock,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Add + AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.PageBlob_ClearPages,
  new OperationAccountSASPermission(
    AccountSASService.Blob,
    AccountSASResourceType.Object,
    AccountSASPermission.Write
  )
);

export default OPERATION_ACCOUNT_SAS_PERMISSIONS;
