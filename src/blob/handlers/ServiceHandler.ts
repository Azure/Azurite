import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import NotImplementedError from "../errors/NotImplementedError";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import { parseXML } from "../generated/utils/xml";
import {
  BLOB_API_VERSION,
  DEFAULT_LIST_CONTAINERS_MAX_RESULTS,
  EMULATOR_ACCOUNT_KIND,
  EMULATOR_ACCOUNT_SKUNAME
} from "../utils/constants";
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
   * Default service properties.
   *
   * @private
   * @memberof ServiceHandler
   */
  private readonly defaultServiceProperties = {
    cors: [],
    defaultServiceVersion: BLOB_API_VERSION,
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

  public getUserDelegationKey(
    keyInfo: Models.KeyInfo,
    options: Models.ServiceGetUserDelegationKeyOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetUserDelegationKeyResponse> {
    throw new NotImplementedError(context.contextId);
  }

  public submitBatch(
    body: NodeJS.ReadableStream,
    contentLength: number,
    multipartContentType: string,
    options: Models.ServiceSubmitBatchOptionalParams,
    context: Context
  ): Promise<Models.ServiceSubmitBatchResponse> {
    throw new NotImplementedError(context.contextId);
  }

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

    // TODO: deserializor has a bug that when cors is undefined,
    // it will serialize it to empty array instead of undefined
    const body = blobCtx.request!.getBody();
    const parsedBody = await parseXML(body || "");
    if (
      !parsedBody.hasOwnProperty("cors") &&
      !parsedBody.hasOwnProperty("Cors")
    ) {
      storageServiceProperties.cors = undefined;
    }

    // Azure Storage allows allowedHeaders and exposedHeaders to be empty,
    // Azurite will set to empty string for this scenario
    for (const cors of storageServiceProperties.cors || []) {
      cors.allowedHeaders = cors.allowedHeaders || "";
      cors.exposedHeaders = cors.exposedHeaders || "";
    }

    await this.metadataStore.setServiceProperties(context, {
      ...storageServiceProperties,
      accountName
    });

    const response: Models.ServiceSetPropertiesResponse = {
      requestId: context.contextId,
      statusCode: 202,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId
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

    if (properties.defaultServiceVersion === undefined) {
      properties.defaultServiceVersion = this.defaultServiceProperties.defaultServiceVersion;
    }

    if (properties.staticWebsite === undefined) {
      properties.staticWebsite = this.defaultServiceProperties.staticWebsite;
    }

    const response: Models.ServiceGetPropertiesResponse = {
      ...properties,
      requestId: context.contextId,
      statusCode: 200,
      version: BLOB_API_VERSION,
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
        context.contextId
      );
    }

    const response: Models.ServiceGetStatisticsResponse = {
      statusCode: 200,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      clientRequestId: options.requestId,
      geoReplication: {
        status: Models.GeoReplicationStatusType.Live,
        lastSyncTime: context.startTime!
      }
    };
    return response;
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
      options.maxresults || DEFAULT_LIST_CONTAINERS_MAX_RESULTS;
    options.prefix = options.prefix || "";

    const marker = options.marker || "";

    const containers = await this.metadataStore.listContainers(
      context,
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
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId
    };

    return res;
  }

  public async getAccountInfo(
    context: Context
  ): Promise<Models.ServiceGetAccountInfoResponse> {
    const response: Models.ContainerGetAccountInfoResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: context.request!.getHeader("x-ms-client-request-id"),
      skuName: EMULATOR_ACCOUNT_SKUNAME,
      accountKind: EMULATOR_ACCOUNT_KIND,
      date: context.startTime!,
      version: BLOB_API_VERSION
    };
    return response;
  }

  public async getAccountInfoWithHead(
    context: Context
  ): Promise<Models.ServiceGetAccountInfoResponse> {
    return this.getAccountInfo(context);
  }
}
