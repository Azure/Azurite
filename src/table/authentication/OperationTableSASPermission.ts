import Operation from "../generated/artifacts/operation";
import { TableSASPermission } from "./TableSASPermissions";

export class OperationTableSASPermission {
  constructor(public readonly permission: string = "") {}

  public validate(permissions: string): boolean {
    return this.validatePermissions(permissions);
  }

  public validatePermissions(permissions: string): boolean {
    for (const p of this.permission) {
      if (permissions.toString().includes(p)) {
        return true;
      }
    }
    return false;
  }
}

// See https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-a-service-sas
// Table Service SAS Permissions for table level
export const OPERATION_TABLE_SAS_TABLE_PERMISSIONS = new Map<
  Operation,
  OperationTableSASPermission
>();

OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Service_SetProperties,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Service_GetProperties,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Service_GetStatistics,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_Query,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_Create,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_Delete,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_QueryEntities,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_QueryEntitiesWithPartitionAndRowKey,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_UpdateEntity,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_MergeEntity,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_DeleteEntity,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_MergeEntityWithMerge,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_InsertEntity,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_GetAccessPolicy,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_SetAccessPolicy,
  new OperationTableSASPermission()
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_InsertEntity,
  new OperationTableSASPermission(TableSASPermission.Add)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_Query,
  new OperationTableSASPermission(TableSASPermission.Query)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_QueryEntities,
  new OperationTableSASPermission(TableSASPermission.Query)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_QueryEntitiesWithPartitionAndRowKey,
  new OperationTableSASPermission(TableSASPermission.Query)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Service_GetProperties,
  new OperationTableSASPermission(TableSASPermission.Query)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Service_GetStatistics,
  new OperationTableSASPermission(TableSASPermission.Query)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_Delete,
  new OperationTableSASPermission(TableSASPermission.Delete)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_DeleteEntity,
  new OperationTableSASPermission(TableSASPermission.Delete)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_UpdateEntity,
  new OperationTableSASPermission(TableSASPermission.Update)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_MergeEntity,
  new OperationTableSASPermission(TableSASPermission.Update)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_MergeEntityWithMerge,
  new OperationTableSASPermission(TableSASPermission.Update)
);
OPERATION_TABLE_SAS_TABLE_PERMISSIONS.set(
  Operation.Table_Batch,
  new OperationTableSASPermission(
    TableSASPermission.Add +
      TableSASPermission.Delete +
      TableSASPermission.Query +
      TableSASPermission.Update
  )
);
