import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import { API_VERSION } from "../utils/constants";
import BaseHandler from "./BaseHandler";

/**
 * ServiceHandler handles Azure Storage Blob service related requests.
 *
 * @export
 * @class ServiceHandler
 * @implements {IHandler}
 */
export default class ServiceHandler extends BaseHandler
  implements IServiceHandler {
  /**
   * Default listing containers max number.
   *
   * @private
   * @memberof ServiceHandler
   */
  private readonly LIST_CONTAINERS_MAX_RESULTS_DEFAULT = 2000;

  /**
   * Default service properties.
   *
   * @private
   * @memberof ServiceHandler
   */
  private readonly defaultServiceProperties = {
    cors: [],
    defaultServiceVersion: API_VERSION,
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
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;

    let properties = await this.dataStore.getServiceProperties(accountName);
    if (!properties) {
      properties = { ...storageServiceProperties, accountName };
    } else {
      const requestCors = storageServiceProperties.cors || [];
      properties.cors = requestCors.length > 0 ? requestCors : properties.cors;
      properties.defaultServiceVersion =
        storageServiceProperties.defaultServiceVersion ||
        properties.defaultServiceVersion;
      properties.deleteRetentionPolicy =
        storageServiceProperties.deleteRetentionPolicy ||
        properties.deleteRetentionPolicy;
      properties.hourMetrics =
        storageServiceProperties.hourMetrics || properties.hourMetrics;
      properties.logging =
        storageServiceProperties.logging || properties.logging;
      properties.minuteMetrics =
        storageServiceProperties.minuteMetrics || properties.minuteMetrics;
      properties.staticWebsite =
        storageServiceProperties.staticWebsite || properties.staticWebsite;
    }

    await this.dataStore.updateServiceProperties({
      ...properties,
      accountName
    });

    const response: Models.ServiceSetPropertiesResponse = {
      requestId: context.contextID,
      statusCode: 202,
      version: API_VERSION
    };
    return response;
  }

  /**
   * Get blob service properties.
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
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;

    let properties = await this.dataStore.getServiceProperties(accountName);
    if (!properties) {
      properties = { ...this.defaultServiceProperties, accountName };
    }

    const response: Models.ServiceGetPropertiesResponse = {
      ...properties,
      requestId: context.contextID,
      statusCode: 200,
      version: API_VERSION
    };
    return response;
  }

  public async getStatistics(
    options: Models.ServiceGetStatisticsOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetStatisticsResponse> {
    throw new NotImplementedError(context.contextID);
  }

  /**
   * List containers.
   *
   * @param {Models.ServiceListContainersSegmentOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ServiceListContainersSegmentResponse>}
   * @memberof ServiceHandler
   */
  public async listContainersSegment(
    options: Models.ServiceListContainersSegmentOptionalParams,
    context: Context
  ): Promise<Models.ServiceListContainersSegmentResponse> {
    const blobCtx = new BlobStorageContext(context);
    const request = blobCtx.request!;
    const accountName = blobCtx.account!;

    options.maxresults =
      options.maxresults || this.LIST_CONTAINERS_MAX_RESULTS_DEFAULT;
    options.prefix = options.prefix || "";

    const marker = parseInt(options.marker || "0", 10);

    const containers = await this.dataStore.listContainers(
      accountName,
      options.prefix,
      options.maxresults,
      marker
    );

    // TODO: Need update list out container lease properties with ContainerHandler.updateLeaseAttributes()
    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const res: Models.ServiceListContainersSegmentResponse = {
      containerItems: containers[0],
      maxResults: options.maxresults,
      nextMarker: `${containers[1] || ""}`,
      prefix: options.prefix,
      serviceEndpoint,
      statusCode: 200,
      requestId: context.contextID,
      version: API_VERSION
    };

    return res;
  }

  public async getAccountInfo(
    context: Context
  ): Promise<Models.ServiceGetAccountInfoResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async getAccountInfoWithHead(
    context: Context
  ): Promise<Models.ServiceGetAccountInfoResponse> {
    throw new NotImplementedError(context.contextID);
  }
}
