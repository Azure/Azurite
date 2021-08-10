import TableStorageContext from "../context/TableStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import NotImplementedError from "../errors/NotImplementedError";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import { TABLE_API_VERSION } from "../utils/constants";
import BaseHandler from "./BaseHandler";

export default class ServiceHandler
  extends BaseHandler
  implements IServiceHandler {
  /**
   * Default service properties.
   *
   * @private
   * @memberof ServiceHandler
   */
  private readonly defaultServiceProperties = {
    cors: [],
    defaultServiceVersion: TABLE_API_VERSION,
    hourMetrics: {
      enabled: false,
      retentionPolicy: {
        enabled: false
      },
      version: "1.0"
    },
    logging: {
      deleteProperty: true,
      read: true,
      retentionPolicy: {
        enabled: false
      },
      version: "1.0",
      write: true
    },
    minuteMetrics: {
      enabled: false,
      retentionPolicy: {
        enabled: false
      },
      version: "1.0"
    }
  };

  // https://docs.microsoft.com/en-us/rest/api/storageservices/get-table-service-properties
  public async getProperties(
    options: Models.ServiceGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetPropertiesResponse> {
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account!;

    let properties = await this.metadataStore.getServiceProperties(
      context,
      accountName
    );
    if (!properties) {
      properties = { ...this.defaultServiceProperties, accountName };
    }

    if (properties.cors === undefined) {
      properties.cors = [];
    }

    if (properties.hourMetrics === undefined) {
      properties.hourMetrics = this.defaultServiceProperties.hourMetrics;
    }

    if (properties.logging === undefined) {
      properties.logging = this.defaultServiceProperties.logging;
    }

    if (properties.minuteMetrics === undefined) {
      properties.minuteMetrics = this.defaultServiceProperties.minuteMetrics;
    }

    const response: Models.ServiceGetPropertiesResponse = {
      ...properties,
      requestId: context.contextID,
      statusCode: 200,
      version: TABLE_API_VERSION,
      clientRequestId: options.requestId
    };
    return response;
  }

  public async setProperties(
    tableServiceProperties: Models.TableServiceProperties,
    options: Models.ServiceSetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceSetPropertiesResponse> {
    // TODO Refer to Blob/Queue ServiceHandler implementation
    throw new NotImplementedError(context);
  }

  public async getStatistics(
    options: Models.ServiceGetStatisticsOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetStatisticsResponse> {

    if (!context.context.isSecondary) {
      throw StorageErrorFactory.getInvalidQueryParameterValue(
        context
      );
    }

    const response: Models.ServiceGetStatisticsResponse = {
      statusCode: 200,
      requestId: context.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      geoReplication: {
        status: Models.GeoReplicationStatusType.Live,
        lastSyncTime: context.startTime!
      },
      clientRequestId: options.requestId
    };
    return response;
  }
}
