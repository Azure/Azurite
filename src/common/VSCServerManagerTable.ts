import { join } from "path";

import TableConfiguration from "../table/TableConfiguration";
import TableServer from "../table/TableServer"
import {
  DEFAULT_TABLE_LOKI_DB_PATH
} from "../table/utils/constants";
import * as Logger from "./Logger";
import NoLoggerStrategy from "./NoLoggerStrategy";
import VSCChannelLoggerStrategy from "./VSCChannelLoggerStrategy";
import VSCChannelWriteStream from "./VSCChannelWriteStream";
import VSCEnvironment from "./VSCEnvironment";
import VSCServerManagerBase from "./VSCServerManagerBase";
import VSCServerManagerClosedState from "./VSCServerManagerClosedState";
import { AzuriteTelemetryClient } from "./Telemetry";

export default class VSCServerManagerTable extends VSCServerManagerBase {
  public readonly accessChannelStream = new VSCChannelWriteStream(
    "Azurite Table"
  );
  private debuggerLoggerStrategy = new VSCChannelLoggerStrategy(
    "Azurite Table Debug"
  );

  public constructor() {
    super("Azurite Table Service", new VSCServerManagerClosedState());
  }

  public getStartCommand(): string {
    return "azurite.start_table";
  }

  public getCloseCommand(): string {
    return "azurite.close_table";
  }

  public getCleanCommand(): string {
    return "azurite.clean_table";
  }

  public async createImpl(): Promise<void> {
    const config = await this.getConfiguration();
    Logger.default.strategy = config.enableDebugLog
      ? this.debuggerLoggerStrategy
      : new NoLoggerStrategy();
    this.server = new TableServer(config);
  }

  public async startImpl(): Promise<void> {
    await this.server!.start();
    await AzuriteTelemetryClient.TraceStartEvent("Table-VSC");
  }

  public async closeImpl(): Promise<void> {
    AzuriteTelemetryClient.TraceStopEvent("Table-VSC");
    this.server!.close();
  }

  public async cleanImpl(): Promise<void> {
    await this.createImpl();
    await this.server!.clean();
  }

  private async getConfiguration(): Promise<TableConfiguration> {
    const env = new VSCEnvironment();
    const location = await env.location();
    AzuriteTelemetryClient.init(location, !env.disableTelemetry(), env.workspaceConfiguration, true);

    // Initialize server configuration
    const config = new TableConfiguration(
      env.tableHost(),
      env.tablePort(),
      env.tableKeepAliveTimeout(),
      join(location, DEFAULT_TABLE_LOKI_DB_PATH),
      (await env.debug()) === true,
      !env.silent(),
      this.accessChannelStream,
      undefined,
      env.loose(),
      env.skipApiVersionCheck(),
      env.cert(),
      env.key(),
      env.pwd(),
      env.oauth(),
      env.disableProductStyleUrl(),
      env.inMemoryPersistence(),
    );
    return config;
  }
}
