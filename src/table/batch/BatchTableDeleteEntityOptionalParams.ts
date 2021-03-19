import {
  DataServiceVersion7,
  QueryOptions,
  ResponseFormat,
  TableDeleteEntityOptionalParams
} from "../generated/artifacts/models";
import IOptionalParams from "./IOptionalParams";

/**
 * Batch Table Delete Entity Optional Params
 *
 * @export
 * @class BatchTableDeleteEntityOptionalParams
 * @implements {TableDeleteEntityOptionalParams}
 */
export default class BatchTableDeleteEntityOptionalParams
  implements TableDeleteEntityOptionalParams, IOptionalParams {
  /**
   * The timeout parameter is expressed in seconds.
   *
   * @type {number}
   * @memberof BatchTableDeleteEntityOptionalParams
   */
  public timeout?: number;

  /**
   * Provides a client-generated, opaque value with a 1 KB character limit that is recorded in the
   * analytics logs when analytics logging is enabled.
   *
   * @type {string}
   * @memberof BatchTableDeleteEntityOptionalParams
   */
  public requestId?: string;

  /**
   * Specifies the data service version. Possible values include: '3.0'
   *
   * @type {DataServiceVersion7}
   * @memberof BatchTableDeleteEntityOptionalParams
   */
  public dataServiceVersion?: DataServiceVersion7;

  /**
   * The properties for the table entity.
   *
   * @type {{ [propertyName: string]: any }}
   * @memberof BatchTableDeleteEntityOptionalParams
   */
  public tableEntityProperties?: { [propertyName: string]: any };

  /**
   * Specifies whether the response should include the inserted entity in the payload. Possible
   * values are return-no-content and return-content. Possible values include: 'return-no-content',
   * 'return-content'
   *
   * @type {ResponseFormat}
   * @memberof BatchTableDeleteEntityOptionalParams
   */
  public responsePreference?: ResponseFormat;

  /**
   * Additional parameters for the operation
   *
   * @type {QueryOptions}
   * @memberof BatchTableDeleteEntityOptionalParams
   */
  public queryOptions?: QueryOptions;
}
