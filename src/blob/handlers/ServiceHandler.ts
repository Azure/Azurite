import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import { parseXML } from "../generated/utils/xml";
import {
  BLOB_API_VERSION,
  DEFAULT_LIST_BLOBS_MAX_RESULTS,
  DEFAULT_LIST_CONTAINERS_MAX_RESULTS,
  EMULATOR_ACCOUNT_ISHIERARCHICALNAMESPACEENABLED,
  EMULATOR_ACCOUNT_KIND,
  EMULATOR_ACCOUNT_SKUNAME,
  HeaderConstants,
} from "../utils/constants";
import BaseHandler from "./BaseHandler";
import IAccountDataStore from "../../common/IAccountDataStore";
import IExtentStore from "../../common/persistence/IExtentStore";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import ILogger from "../../common/ILogger";
import { BlobBatchHandler } from "./BlobBatchHandler";
import { Readable } from "stream";
import { OAuthLevel } from "../../common/models";
import { BEARER_TOKEN_PREFIX } from "../../common/utils/constants";
import { decode } from "jsonwebtoken";
import { getUserDelegationKeyValue } from "../utils/utils"

/**
 * ServiceHandler handles Azure Storage Blob service related requests.
 *
 * @export
 * @class ServiceHandler
 * @implements {IHandler}
 */
export default class ServiceHandler extends BaseHandler
  implements IServiceHandler {
  protected disableProductStyle?: boolean;

  constructor(
    private readonly accountDataStore: IAccountDataStore,
    private readonly oauth: OAuthLevel | undefined,
    metadataStore: IBlobMetadataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    loose: boolean,
    disableProductStyle?: boolean
  ) {
    super(metadataStore, extentStore, logger, loose);
    this.disableProductStyle = disableProductStyle;
  }
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

  public async getUserDelegationKey(
    keyInfo: Models.KeyInfo,
    options: Models.ServiceGetUserDelegationKeyOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetUserDelegationKeyResponse> {
    const blobContext = new BlobStorageContext(context);
    const request = blobContext.request!;
    const authHeaderValue = request.getHeader(HeaderConstants.AUTHORIZATION);
    const token = authHeaderValue!.substr(BEARER_TOKEN_PREFIX.length + 1);
    const decodedToken = decode(token) as { [key: string]: any };
    const keyValue = getUserDelegationKeyValue(
      decodedToken.oid,
      decodedToken.tid,
      keyInfo.start,
      keyInfo.expiry,
      BLOB_API_VERSION
    );

    const response: Models.ServiceGetUserDelegationKeyResponse = {
      statusCode: 200,
      signedOid: decodedToken.oid,
      signedTid: decodedToken.tid,
      signedService: "b",
      signedVersion: BLOB_API_VERSION,
      signedStart: keyInfo.start,
      signedExpiry: keyInfo.expiry,
      value: keyValue
    };

    return response;
  }


  public async submitBatch(
    body: NodeJS.ReadableStream,
    contentLength: number,
    multipartContentType: string,
    options: Models.ServiceSubmitBatchOptionalParams,
    context: Context
  ): Promise<Models.ServiceSubmitBatchResponse> {
    const blobServiceCtx = new BlobStorageContext(context);
    const requestBatchBoundary = blobServiceCtx.request!.getHeader("content-type")!.split("=")[1];

    const blobBatchHandler = new BlobBatchHandler(this.accountDataStore, this.oauth,
      this.metadataStore, this.extentStore, this.logger, this.loose, this.disableProductStyle);

    const responseBodyString = await blobBatchHandler.submitBatch(body,
      requestBatchBoundary,
      "",
      context.request!,
      context);

    const responseBody = new Readable();
    responseBody.push(responseBodyString);
    responseBody.push(null);

    // No client request id defined in batch response, should refine swagger and regenerate from it.
    // batch response succeed code should be 202 instead of 200, should refine swagger and regenerate from it.
    const response: Models.ServiceSubmitBatchResponse = {
      statusCode: 202,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      contentType: "multipart/mixed; boundary=" + requestBatchBoundary,
      body: responseBody
    };

    return response;
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

    // TODO: deserializer has a bug that when cors is undefined,
    // it will serialize it to empty array instead of undefined
    const body = blobCtx.request!.getBody();
    const parsedBody = await parseXML(body || "");
    if (
      !Object.hasOwnProperty.bind(parsedBody)('cors') &&
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
    // TODO: Need update list out container lease properties with ContainerHandler.updateLeaseAttributes()
    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const res: Models.ServiceListContainersSegmentResponse = {
      containerItems: containers[0].map(item => {
        return {
          ...item,
          metadata: includeMetadata ? item.metadata : undefined
        };
      }),
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
    const response: Models.ServiceGetAccountInfoResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: context.request!.getHeader("x-ms-client-request-id"),
      skuName: EMULATOR_ACCOUNT_SKUNAME,
      accountKind: EMULATOR_ACCOUNT_KIND,
      date: context.startTime!,
      isHierarchicalNamespaceEnabled: EMULATOR_ACCOUNT_ISHIERARCHICALNAMESPACEENABLED,
      version: BLOB_API_VERSION
    };
    return response;
  }

  public async getAccountInfoWithHead(
    context: Context
  ): Promise<Models.ServiceGetAccountInfoResponse> {
    return this.getAccountInfo(context);
  }

  public async filterBlobs(
    options: Models.ServiceFilterBlobsOptionalParams,
    context: Context
  ): Promise<Models.ServiceFilterBlobsResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;

    const request = context.request!;
    const marker = options.marker;
    options.marker = options.marker || "";
    if (
      options.maxresults === undefined ||
      options.maxresults > DEFAULT_LIST_BLOBS_MAX_RESULTS
    ) {
      options.maxresults = DEFAULT_LIST_BLOBS_MAX_RESULTS;
    }

    const [blobs, nextMarker] = await this.metadataStore.filterBlobs(
      context,
      accountName,
      undefined,
      options.where,
      options.maxresults,
      marker,
    );

    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const response: Models.ServiceFilterBlobsResponse = {
      statusCode: 200,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      serviceEndpoint,
      where: options.where!,
      blobs: blobs,
      clientRequestId: options.requestId,
      nextMarker: `${nextMarker || ""}`
    };
    return response;
  }
}
