import { join } from "path";

import DataLakeConfiguration from "../dfs/DataLakeConfiguration";
import DataLakeServer from "../dfs/DataLakeServer";
import {
  DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
  DEFAULT_BLOB_LOKI_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_ARRAY,
  DEFAULT_BLOB_PERSISTENCE_PATH
} from "../blob/utils/constants";
import * as Logger from "./Logger";
import NoLoggerStrategy from "./NoLoggerStrategy";
import VSCChannelLoggerStrategy from "./VSCChannelLoggerStrategy";
import VSCChannelWriteStream from "./VSCChannelWriteStream";
import VSCEnvironment from "./VSCEnvironment";
import VSCServerManagerBase from "./VSCServerManagerBase";
import VSCServerManagerClosedState from "./VSCServerManagerClosedState";

export default class VSCServerManagerDataLake extends VSCServerManagerBase {
  public readonly accessChannelStream = new VSCChannelWriteStream(
    "Azurite DataLake"
  );
  private debuggerLoggerStrategy = new VSCChannelLoggerStrategy(
    "Azurite DataLake Debug"
  );

  public constructor() {
    super("Azurite DataLake Service", new VSCServerManagerClosedState());
  }

  public getStartCommand(): string {
    return "azurite.start_datalake";
  }

  public getCloseCommand(): string {
    return "azurite.close_datalake";
  }

  public getCleanCommand(): string {
    return "azurite.clean_datalake";
  }

  public async createImpl(): Promise<void> {
    const config = await this.getConfiguration();
    Logger.default.strategy = config.enableDebugLog
      ? this.debuggerLoggerStrategy
      : new NoLoggerStrategy();
    this.server = new DataLakeServer(config);
  }

  public async startImpl(): Promise<void> {
    await this.server!.start();
  }

  public async closeImpl(): Promise<void> {
    this.server!.close();
  }

  public async cleanImpl(): Promise<void> {
    await this.createImpl();
    await this.server!.clean();
  }

  private async getConfiguration(): Promise<DataLakeConfiguration> {
    const env = new VSCEnvironment();
    const location = await env.location();

    DEFAULT_BLOB_PERSISTENCE_ARRAY[0].locationPath = join(
      location,
      DEFAULT_BLOB_PERSISTENCE_PATH
    );

    // Initialize server configuration
    const config = new DataLakeConfiguration(
      env.datalakeHost(),
      env.datalakePort(),
      join(location, DEFAULT_BLOB_LOKI_DB_PATH),
      join(location, DEFAULT_BLOB_EXTENT_LOKI_DB_PATH),
      DEFAULT_BLOB_PERSISTENCE_ARRAY,
      !env.silent(),
      this.accessChannelStream,
      (await env.debug()) === true,
      undefined,
      env.loose(),
      env.skipApiVersionCheck(),
      env.cert(),
      env.key(),
      env.pwd(),
      env.oauth(),
      env.disableProductStyleUrl()
    );
    return config;
  }
}
