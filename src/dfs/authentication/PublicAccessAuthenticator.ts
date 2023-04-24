import BlobPublicAccessAuthenticator from "../../blob/authentication/PublicAccessAuthenticator";
import Operation from "../generated/artifacts/operation";
import Context from "../../blob/generated/Context";
import IAuthenticator from "./IAuthenticator";

const CONTAINER_PUBLIC_READ_OPERATIONS = new Set<Operation>([
  //blob
  Operation.Container_GetProperties,
  Operation.Container_GetPropertiesWithHead,
  Operation.Container_GetAccessPolicy,
  Operation.PageBlob_GetPageRanges, // TODO: Not sure
  Operation.PageBlob_GetPageRangesDiff, // TODO: Not sure
  Operation.BlockBlob_GetBlockList, // TODO: Not sure
  //DataLake
  Operation.FileSystem_GetProperties,
  Operation.FileSystem_ListBlobFlatSegment,
  Operation.FileSystem_ListBlobHierarchySegment,
  Operation.FileSystem_ListPaths,
  Operation.Path_Read,
  Operation.Path_GetProperties
]);

const BLOB_PUBLIC_READ_OPERATIONS = new Set<Operation>([
  //blob
  Operation.PageBlob_GetPageRanges, // TODO: Not sure
  Operation.PageBlob_GetPageRangesDiff, // TODO: Not sure
  Operation.BlockBlob_GetBlockList, // TODO: Not sure
  //DataLake
  Operation.Path_Read,
  Operation.Path_GetProperties
]);

export default class PublicAccessAuthenticator extends BlobPublicAccessAuthenticator implements IAuthenticator {

  protected override isContainerPublicReadOperation(context: Context): boolean {
    return CONTAINER_PUBLIC_READ_OPERATIONS.has(context.context.dfsOperation!)
  }

  protected override isBlobPublicReadOperation(context: Context): boolean {
    return BLOB_PUBLIC_READ_OPERATIONS.has(context.context.dfsOperation!);
  }

  protected override getOperationString(context: Context): string {
    return Operation[context.context.dfsOperation!]
  }
}
