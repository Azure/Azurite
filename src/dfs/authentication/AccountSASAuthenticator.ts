import Operation from "../generated/artifacts/operation";
import Context from "../../blob/generated/Context";
import IAuthenticator from "./IAuthenticator";
import BlobAccountSASAuthenticator from "../../blob/authentication/AccountSASAuthenticator"
import OPERATION_ACCOUNT_SAS_PERMISSIONS from "./OperationAccountSASPermission";
import BLOB_OPERATION_ACCOUNT_SAS_PERMISSIONS, { OperationAccountSASPermission } from "../../blob/authentication/OperationAccountSASPermission";

export default class AccountSASAuthenticator extends BlobAccountSASAuthenticator implements IAuthenticator {

  protected override isSpecialPermissions(context: Context): boolean {
    const operation: Operation = context.context.dfsOperation!;
    //Blob
    return operation === Operation.BlockBlob_Upload ||
    operation === Operation.PageBlob_Create ||
    operation === Operation.AppendBlob_Create ||
    operation === Operation.Blob_StartCopyFromURL ||
    operation === Operation.Blob_CopyFromURL ||
    //DataLake
    operation === Operation.Path_Create ||
    operation === Operation.Path_AppendData ||
    operation === Operation.Path_FlushData
  }

  protected override getOperationAccountSASPermission(context: Context): OperationAccountSASPermission | undefined {
    const operation = BLOB_OPERATION_ACCOUNT_SAS_PERMISSIONS.get(context.operation!);
    if (operation !== undefined) return operation;
    return OPERATION_ACCOUNT_SAS_PERMISSIONS.get(context.context.dfsOperation!);
  }

  protected override getOperationString(context: Context): string {
    return Operation[context.context.dfsOperation!]
  }
}
