import Operation from "../generated/artifacts/operation";
import { QueueSASPermission } from "./QueueSASPermissions";

export class OperationQueueSASPermission {
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
// Blob Service SAS Permissions for blob level
export const OPERATION_QUEUE_SAS_PERMISSIONS = new Map<
  Operation,
  OperationQueueSASPermission
>();

// Init permission as "" for all operations.
for (const operation in Operation) {
  if (!isNaN(Number(operation))) {
    OPERATION_QUEUE_SAS_PERMISSIONS.set(
      Number(operation),
      new OperationQueueSASPermission()
    );
  }
}

OPERATION_QUEUE_SAS_PERMISSIONS.set(
  Operation.Queue_GetProperties,
  new OperationQueueSASPermission(QueueSASPermission.Read)
);

OPERATION_QUEUE_SAS_PERMISSIONS.set(
  Operation.Queue_GetPropertiesWithHead,
  new OperationQueueSASPermission(QueueSASPermission.Read)
);

OPERATION_QUEUE_SAS_PERMISSIONS.set(
  Operation.Messages_Peek,
  new OperationQueueSASPermission(QueueSASPermission.Read)
);

OPERATION_QUEUE_SAS_PERMISSIONS.set(
  Operation.Messages_Enqueue,
  new OperationQueueSASPermission(QueueSASPermission.Add)
);

OPERATION_QUEUE_SAS_PERMISSIONS.set(
  Operation.MessageId_Update,
  new OperationQueueSASPermission(QueueSASPermission.Update)
);

OPERATION_QUEUE_SAS_PERMISSIONS.set(
  Operation.Messages_Dequeue,
  new OperationQueueSASPermission(QueueSASPermission.Process)
);

OPERATION_QUEUE_SAS_PERMISSIONS.set(
  Operation.MessageId_Delete,
  new OperationQueueSASPermission(QueueSASPermission.Process)
);
