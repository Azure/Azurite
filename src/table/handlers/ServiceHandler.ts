import TableStorageContext from "../context/TableStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import { parseXML } from "../generated/utils/xml";
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
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account!;

    // TODO: deserializer has a bug that when cors is undefined,
    // it will serialize it to empty array instead of undefined
    const body = tableCtx.request!.getBody();
    const parsedBody = await parseXML(body || "");
    if (
      !Object.hasOwnProperty.bind(parsedBody)('cors')&&
      !Object.hasOwnProperty.bind(parsedBody)('Cors')
    ) {
      tableServiceProperties.cors = undefined;
    }

    // Azure Storage allows allowedHeaders and exposedHeaders to be empty,
    // Azurite will set to empty string for this scenario
    for (const cors of tableServiceProperties.cors || []) {
      cors.allowedHeaders = cors.allowedHeaders || "";
      cors.exposedHeaders = cors.exposedHeaders || "";
    }

    await this.metadataStore.setServiceProperties(context, {
      ...tableServiceProperties,
      accountName
    });

    const response: Models.ServiceSetPropertiesResponse = {
      requestId: context.contextID,
      statusCode: 202,
      version: TABLE_API_VERSION,
      clientRequestId: options.requestId
    };
    return response;
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
