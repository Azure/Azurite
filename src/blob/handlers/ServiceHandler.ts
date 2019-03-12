import NotImplementedError from "../errors/NotImplementedError";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import { API_VERSION } from "../utils/constants";
import BaseHandler from "./BaseHandler";

/**
 * Manually implement handlers by implementing IServiceHandler interface.
 * Handlers will talk with persistency layer directly.
 *
 * @export
 * @class SimpleHandler
 * @implements {IHandler}
 */
export default class ServiceHandler extends BaseHandler
  implements IServiceHandler {
  public async setProperties(
    storageServiceProperties: Models.StorageServiceProperties,
    options: Models.ServiceSetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceSetPropertiesResponse> {
    await this.dataStore.setServiceProperties(storageServiceProperties);
    const response: Models.ServiceSetPropertiesResponse = {
      requestId: context.contextID,
      statusCode: 202,
      version: API_VERSION
    };
    return response;
  }

  public async getProperties(
    options: Models.ServiceGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetPropertiesResponse> {
    const properties = await this.dataStore.getServiceProperties();
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

  public async listContainersSegment(
    options: Models.ServiceListContainersSegmentOptionalParams,
    context: Context
  ): Promise<Models.ServiceListContainersSegmentResponse> {
    const LIST_CONTAINERS_MAX_RESULTS_DEFAULT = 2000;
    options.maxresults =
      options.maxresults || LIST_CONTAINERS_MAX_RESULTS_DEFAULT;
    options.prefix = options.prefix || "";

    const marker = parseInt(options.marker || "0", 10);

    const containers = await this.dataStore.listContainers<
      Models.ContainerItem
    >(options.prefix, options.maxresults, marker);

    const res: Models.ServiceListContainersSegmentResponse = {
      containerItems: containers[0],
      maxResults: options.maxresults,
      nextMarker: `${containers[1] || ""}`,
      prefix: options.prefix,
      serviceEndpoint: `http://127.0.0.1:1000`, // TODO: Update Context to include req and res and get server endpoint
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
}
