import { access, ensureDir } from "fs-extra";
import { join } from "path";

import QueueConfiguration from "../queue/QueueConfiguration";
import QueueServer from "../queue/QueueServer";
import {
  DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH,
  DEFAULT_QUEUE_LOKI_DB_PATH,
  DEFAULT_QUEUE_PERSISTENCE_ARRAY,
  DEFAULT_QUEUE_PERSISTENCE_PATH
} from "../queue/utils/constants";
import * as Logger from "./Logger";
import NoLoggerStrategy from "./NoLoggerStrategy";
import VSCChannelLoggerStrategy from "./VSCChannelLoggerStrategy";
import VSCChannelWriteStream from "./VSCChannelWriteStream";
import VSCEnvironment from "./VSCEnvironment";
import VSCServerManagerBase from "./VSCServerManagerBase";
import VSCServerManagerClosedState from "./VSCServerManagerClosedState";
import { AzuriteTelemetryClient } from "./Telemetry";

export default class VSCServerManagerBlob extends VSCServerManagerBase {
  public readonly accessChannelStream = new VSCChannelWriteStream(
    "Azurite Queue"
  );
  private debuggerLoggerStrategy = new VSCChannelLoggerStrategy(
    "Azurite Queue Debug"
  );

  public constructor() {
    super("Azurite Queue Service", new VSCServerManagerClosedState());
  }

  public getStartCommand(): string {
    return "azurite.start_queue";
  }

  public getCloseCommand(): string {
    return "azurite.close_queue";
  }

  public getCleanCommand(): string {
    return "azurite.clean_queue";
  }

  public async createImpl(): Promise<void> {
    const config = await this.getConfiguration();
    Logger.default.strategy = config.enableDebugLog
      ? this.debuggerLoggerStrategy
      : new NoLoggerStrategy();
    this.server = new QueueServer(config);
  }

  public async startImpl(): Promise<void> {
    await this.server!.start();
    await AzuriteTelemetryClient.TraceStartEvent("Queue-VSC");
  }

  public async closeImpl(): Promise<void> {
    AzuriteTelemetryClient.TraceStopEvent("Queue-VSC");
    this.server!.close();
  }

  public async cleanImpl(): Promise<void> {
    await this.createImpl();
    await this.server!.clean();
  }

  private async getConfiguration(): Promise<QueueConfiguration> {
    const env = new VSCEnvironment();
    const location = await env.location();
    await ensureDir(location);
    await access(location);

    DEFAULT_QUEUE_PERSISTENCE_ARRAY[0].locationPath = join(
      location,
      DEFAULT_QUEUE_PERSISTENCE_PATH
    );
    AzuriteTelemetryClient.init(DEFAULT_QUEUE_PERSISTENCE_ARRAY[0].locationPath, !env.disableTelemetry(), env.workspaceConfiguration, true);

    // Initialize server configuration
    const config = new QueueConfiguration(
      env.queueHost(),
      env.queuePort(),
      env.queueKeepAliveTimeout(),
      join(location, DEFAULT_QUEUE_LOKI_DB_PATH),
      join(location, DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH),
      DEFAULT_QUEUE_PERSISTENCE_ARRAY,
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
      env.disableProductStyleUrl(),
      env.inMemoryPersistence(),
    );
    return config;
  }
}
