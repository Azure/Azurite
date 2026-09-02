import QueueStorageContext from "../context/QueueStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import { parseXML } from "../generated/utils/xml";
import {
  LIST_QUEUE_MAXRESULTS_MAX,
  LIST_QUEUE_MAXRESULTS_MIN,
  QUEUE_API_VERSION
} from "../utils/constants";
import BaseHandler from "./BaseHandler";

/**
 * ServiceHandler handles Azure Storage queue service related requests.
 *
 * @export
 * @class ServiceHandler
 * @implements {IHandler}
 */
export default class ServiceHandler extends BaseHandler
  implements IServiceHandler {
  /**
   * Default listing queues max number.
   *
   * @private
   * @memberof ServiceHandler
   */
  private readonly LIST_QUEUES_MAX_RESULTS_DEFAULT = 5000;

  /**
   * Default service properties.
   *
   * @private
   * @memberof ServiceHandler
   */
  private readonly defaultServiceProperties = {
    cors: [],
    defaultServiceVersion: QUEUE_API_VERSION,
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
    },
    staticWebsite: {
      enabled: false
    }
  };

  /**
   * Set blob service properties.
   *
   * @param {Models.StorageServiceProperties} storageServiceProperties
   * @param {Models.ServiceSetPropertiesOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ServiceSetPropertiesResponse>}
   * @memberof ServiceHandler
   */
  public async setProperties(
    storageServiceProperties: Models.StorageServiceProperties,
    options: Models.ServiceSetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceSetPropertiesResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;

    // TODO: deserializer has a bug that when cors is undefined,
    // it will serialize it to empty array instead of undefined
    const body = queueCtx.request!.getBody();
    const parsedBody = await parseXML(body || "");
    if (
      !Object.hasOwnProperty.bind(parsedBody)('cors')&&
      !Object.hasOwnProperty.bind(parsedBody)('Cors')
    ) {
      storageServiceProperties.cors = undefined;
    }

    // Azure Storage allows allowedHeaders and exposedHeaders to be empty,
    // Azurite will set to empty string for this scenario
    for (const cors of storageServiceProperties.cors || []) {
      cors.allowedHeaders = cors.allowedHeaders || "";
      cors.exposedHeaders = cors.exposedHeaders || "";
    }

    await this.metadataStore.updateServiceProperties({
      ...storageServiceProperties,
      accountName
    });

    const response: Models.ServiceSetPropertiesResponse = {
      requestId: context.contextID,
      statusCode: 202,
      version: QUEUE_API_VERSION,
      clientRequestId: options.requestId
    };
    return response;
  }

  /**
   * Get queue service properties.
   *
   * @param {Models.ServiceGetPropertiesOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ServiceGetPropertiesResponse>}
   * @memberof ServiceHandler
   */
  public async getProperties(
    options: Models.ServiceGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetPropertiesResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;

    let properties = await this.metadataStore.getServiceProperties(accountName);
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
      version: QUEUE_API_VERSION,
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
        context.contextID
      );
    }

    const response: Models.ServiceGetStatisticsResponse = {
      statusCode: 200,
      requestId: context.contextID,
      version: QUEUE_API_VERSION,
      date: context.startTime,
      geoReplication: {
        status: Models.GeoReplicationStatusType.Live,
        lastSyncTime: context.startTime!
      },
      clientRequestId: options.requestId
    };
    return response;
  }

  /**
   * List queues.
   *
   * @param {Models.ServiceListQueuesSegmentOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ServiceListQueuesSegmentResponse>}
   * @memberof ServiceHandler
   */
  public async listQueuesSegment(
    options: Models.ServiceListQueuesSegmentOptionalParams,
    context: Context
  ): Promise<Models.ServiceListQueuesSegmentResponse> {
    const queueCtx = new QueueStorageContext(context);
    const request = queueCtx.request!;
    const accountName = queueCtx.account!;

    let maxresults = this.LIST_QUEUES_MAX_RESULTS_DEFAULT;
    if (options.maxresults !== undefined) {
      if (
        options.maxresults < LIST_QUEUE_MAXRESULTS_MIN ||
        options.maxresults > LIST_QUEUE_MAXRESULTS_MAX
      ) {
        throw StorageErrorFactory.getOutOfRangeQueryParameterValue(
          context.contextID,
          {
            QueryParameterName: "maxresults",
            QueryParameterValue: `${options.maxresults}`,
            MinimumAllowed: `${LIST_QUEUE_MAXRESULTS_MIN}`,
            MaximumAllowed: `${LIST_QUEUE_MAXRESULTS_MAX}`
          }
        );
      }
      maxresults = options.maxresults;
    }

    options.prefix = options.prefix || "";

    const marker = parseInt(options.marker || "0", 10);

    const queues = await this.metadataStore.listQueues(
      accountName,
      options.prefix,
      maxresults,
      marker
    );

    // Only the query parameter "include" contains the value "metadata" can the result present the metadata.
    let includeMetadata = false;
    if (options.include) {
      for (const item of options.include) {
        if (item.toLowerCase() === "metadata") {
          includeMetadata = true;
          break;
        }
      }
    }
    if (!includeMetadata) {
      for (const queue of queues[0]) {
        queue.metadata = undefined;
      }
    }

    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const res: Models.ServiceListQueuesSegmentResponse = {
      queueItems: queues[0],
      maxResults: maxresults,
      nextMarker: `${queues[1] || ""}`,
      prefix: options.prefix,
      serviceEndpoint,
      statusCode: 200,
      requestId: context.contextID,
      version: QUEUE_API_VERSION,
      clientRequestId: options.requestId
    };

    return res;
  }
}
