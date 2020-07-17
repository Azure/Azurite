import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";

import BaseHandler from "./BaseHandler";

export default class ServiceHandler extends BaseHandler
  implements IServiceHandler {
  public async setProperties(
    tableServiceProperties: Models.TableServiceProperties,
    options: Models.ServiceSetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceSetPropertiesResponse> {
    // TODO
    return undefined as any;
  }

  public async getProperties(
    options: Models.ServiceGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetPropertiesResponse> {
    // TODO
    return undefined as any;
  }

  public async getStatistics(
    options: Models.ServiceGetStatisticsOptionalParams,
    context: Context
  ): Promise<Models.ServiceGetStatisticsResponse> {
    // TODO
    return undefined as any;
  }
}
