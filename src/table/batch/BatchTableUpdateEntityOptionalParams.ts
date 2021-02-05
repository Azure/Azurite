import BatchRequest from "../../common/batch/BatchRequest";
import {
  DataServiceVersion5,
  QueryOptions,
  ResponseFormat,
  TableUpdateEntityOptionalParams
} from "../generated/artifacts/models";

export default class BatchTableUpdateEntityOptionalParams
  implements TableUpdateEntityOptionalParams {
  /**
   * The timeout parameter is expressed in seconds.
   */
  public timeout?: number;
  /**
   * Provides a client-generated, opaque value with a 1 KB character limit that is recorded in the
   * analytics logs when analytics logging is enabled.
   */
  public requestId?: string;
  /**
   * Specifies the data service version. Possible values include: '3.0'
   */
  public dataServiceVersion?: DataServiceVersion5;
  /**
   * The properties for the table entity.
   */
  public tableEntityProperties?: { [propertyName: string]: any };
  /**
   * Specifies whether the response should include the inserted entity in the payload. Possible
   * values are return-no-content and return-content. Possible values include: 'return-no-content',
   * 'return-content'
   */
  public responsePreference?: ResponseFormat;
  /**
   * Additional parameters for the operation
   */
  public queryOptions?: QueryOptions;
  public constructor(batchRequest: BatchRequest) {
    // timeout is optional query parameter
    if (batchRequest.getHeader("x-ms-client-request-id") !== undefined) {
      this.requestId = batchRequest.getHeader("x-ms-client-request-id");
    }
    if (batchRequest.getHeader("DataServiceVersion") === "3.0") {
      this.dataServiceVersion = DataServiceVersion5.ThreeFullStopZero;
    }
    const body = batchRequest.getBody();
    if (body != null) {
      this.tableEntityProperties = JSON.parse(body);
    }
  }
}
