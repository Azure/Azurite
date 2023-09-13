import { HttpMethod } from "../../table/generated/IRequest";

/**
 * A container for batch operations
 *
 * @export
 * @class BatchOperation
 */
export default class BatchOperation {
  public rawHeaders: string[];
  public headers: { [header: string]: string | string[] | undefined } = {};
  public protocol?: string;
  public httpMethod?: HttpMethod;
  public parameters?: string;
  public uri?: string;
  public path?: string;
  public jsonRequestBody?: string; // maybe we want the entity operation to be stored in a parsed format?
  public constructor(headers: string) {
    const dirtyHeaderArray = headers.split("\n").map(line => line.trim());
    // filter out the blanks
    this.rawHeaders = dirtyHeaderArray.filter(
      candidate => candidate
    );
  }
}
