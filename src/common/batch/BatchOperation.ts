import { HttpMethod } from "../../blob/generated/IRequest";

export enum BatchType {
  blob = "blob",
  table = "table"
}

/**
 * A container for batch operations
 *
 * @export
 * @class BatchOperation
 */
export default class BatchOperation {
  public rawHeaders: string[];
  public protocol?: string;
  public batchType: BatchType;
  public httpMethod?: HttpMethod;
  public parameters?: string;
  public uri?: string;
  public path?: string;
  public jsonRequestBody?: string; // maybe we want the entity operation to be stored in a parsed format?
  public constructor(_batchType: BatchType, headers: string) {
    this.batchType = _batchType;
    const dirtyHeaderArray = headers.split("\n");
    // filter out the blanks
    this.rawHeaders = dirtyHeaderArray.filter(
      (candidate) => candidate.search(/\S/) < 1
    );
  }
}
