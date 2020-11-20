import NotImplementedError from "../errors/NotImplementedError";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import BaseHandler from "./BaseHandler";

export default class ServiceHandler
  extends BaseHandler
  implements IServiceHandler {
  public async setProperties(
    tableServiceProperties: Models.TableServiceProperties,
    options: Models.ServiceSetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceSetPropertiesResponse> {
    // TODO Refer to Blob/Queue ServiceHandler implementation
    throw new NotImplementedError(context);
  }

  public async getProperties(
    options: Models.ServiceGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetPropertiesResponse> {
    // TODO Refer to Blob/Queue ServiceHandler implementation
    throw new NotImplementedError(context);
  }

  public async getStatistics(
    options: Models.ServiceGetStatisticsOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetStatisticsResponse> {
    // TODO Refer to Blob/Queue ServiceHandler implementation
    throw new NotImplementedError(context);
  }
}
