import Operation from "../generated/artifacts/operation";
import Context from "../../blob/generated/Context";
import { BlobSASResourceType } from "../../blob/authentication/BlobSASResourceType";
import IAuthenticator from "./IAuthenticator";
import {
  OPERATION_BLOB_SAS_BLOB_PERMISSIONS,
  OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS
} from "./OperationBlobSASPermission";
import {
  OPERATION_BLOB_SAS_BLOB_PERMISSIONS as BLOB_OPERATION_BLOB_SAS_BLOB_PERMISSIONS,
  OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS as BLOB_OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS
} from "../../blob/authentication/OperationBlobSASPermission";
import BlobBlobSASAuthenticator from "../../blob/authentication/BlobSASAuthenticator";
import { OperationBlobSASPermission } from "../../blob/authentication/OperationBlobSASPermission";

export default class BlobSASAuthenticator extends BlobBlobSASAuthenticator implements IAuthenticator {

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

  protected override getOperationBlobSASPermission(
    resource: BlobSASResourceType, 
    context: Context
  ):  OperationBlobSASPermission | undefined {
    const permission =  resource === BlobSASResourceType.Blob
        ? BLOB_OPERATION_BLOB_SAS_BLOB_PERMISSIONS.get(context.operation!)
        : BLOB_OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.get(context.operation!);
    if (permission !== undefined) return permission;
    return  resource === BlobSASResourceType.Blob
        ? OPERATION_BLOB_SAS_BLOB_PERMISSIONS.get(context.context.dfsOperation!)
        : OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.get(context.context.dfsOperation!);
  }

  protected override getOperationString(context: Context): string {
    return Operation[context.context.dfsOperation!]
  }
}
