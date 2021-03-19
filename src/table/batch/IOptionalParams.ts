import {
  DataServiceVersion3,
  DataServiceVersion4,
  DataServiceVersion5,
  DataServiceVersion6,
  DataServiceVersion7,
  DataServiceVersion9,
  QueryOptions
} from "../generated/artifacts/models";

/**
 * Interface to simplify the processing of batch requests which need to
 * be sent through to the table handler.
 *
 * @export
 * @interface IOptionalParams
 */
export default interface IOptionalParams {
  /**
   * Provides a client-generated, opaque value with a 1 KB character limit that is recorded in the
   * analytics logs when analytics logging is enabled.
   *
   * @type {(string | undefined)}
   * @memberof IOptionalParams
   */
  requestId?: string | undefined;

  /**
   * Specifies the data service version. Possible values include: '3.0', although the service returns 1.0!
   *
   * @type {(DataServiceVersion4 | DataServiceVersion5 | undefined)}
   * @memberof IOptionalParams
   */
  dataServiceVersion?:
    | DataServiceVersion3
    | DataServiceVersion4
    | DataServiceVersion5
    | DataServiceVersion6
    | DataServiceVersion7
    | DataServiceVersion9
    | undefined;

  /**
   * The properties for the table entity.
   *
   * @type {{ [propertyName: string]: any }}
   * @memberof IOptionalParams
   */
  tableEntityProperties?: { [propertyName: string]: any };

  /**
   * Additional parameters for the operation
   *
   * @type {QueryOptions}
   * @memberof IOptionalParams
   */
  queryOptions?: QueryOptions;
}
