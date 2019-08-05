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
  Operation.Service_GetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_SetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Service,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_ListQueuesSegment,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Service,
    AccountSASPermission.List
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Service_GetStatistics,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Service,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Queue_Create,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    AccountSASPermission.Create + AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Queue_Delete,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    AccountSASPermission.Delete
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Queue_GetProperties,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Queue_GetPropertiesWithHead,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Queue_SetMetadata,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    AccountSASPermission.Write
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Queue_GetAccessPolicy,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    "" // Not allowed.
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Queue_GetAccessPolicyWithHead,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    "" // Not allowed.
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Queue_SetAccessPolicy,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    "" // Not allowed.
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Messages_Enqueue,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Object,
    AccountSASPermission.Add
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Messages_Dequeue,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Object,
    AccountSASPermission.Process
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Messages_Peek,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Object,
    AccountSASPermission.Read
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.MessageId_Delete,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    AccountSASPermission.Process
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.Messages_Clear,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    AccountSASPermission.Delete
  )
);

OPERATION_ACCOUNT_SAS_PERMISSIONS.set(
  Operation.MessageId_Update,
  new OperationAccountSASPermission(
    AccountSASService.Queue,
    AccountSASResourceType.Container,
    AccountSASPermission.Update
  )
);

export default OPERATION_ACCOUNT_SAS_PERMISSIONS;
