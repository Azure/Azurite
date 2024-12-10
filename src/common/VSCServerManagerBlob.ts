import { join } from "path";

import BlobConfiguration from "../blob/BlobConfiguration";
import BlobServer from "../blob/BlobServer";
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
import { AzuriteTelemetryClient } from "./Telemetry";

export default class VSCServerManagerBlob extends VSCServerManagerBase {
  public readonly accessChannelStream = new VSCChannelWriteStream(
    "Azurite Blob"
  );
  private debuggerLoggerStrategy = new VSCChannelLoggerStrategy(
    "Azurite Blob Debug"
  );

  public constructor() {
    super("Azurite Blob Service", new VSCServerManagerClosedState());
  }

  public getStartCommand(): string {
    return "azurite.start_blob";
  }

  public getCloseCommand(): string {
    return "azurite.close_blob";
  }

  public getCleanCommand(): string {
    return "azurite.clean_blob";
  }

  public async createImpl(): Promise<void> {
    const config = await this.getConfiguration();
    Logger.default.strategy = config.enableDebugLog
      ? this.debuggerLoggerStrategy
      : new NoLoggerStrategy();
    this.server = new BlobServer(config);
  }

  public async startImpl(): Promise<void> {
    await this.server!.start();
    await AzuriteTelemetryClient.TraceStartEvent("Blob-VSC");
  }

  public async closeImpl(): Promise<void> {
    AzuriteTelemetryClient.TraceStopEvent("Blob-VSC");
    this.server!.close();
  }

  public async cleanImpl(): Promise<void> {
    await this.createImpl();
    await this.server!.clean();
  }

  private async getConfiguration(): Promise<BlobConfiguration> {
    const env = new VSCEnvironment();
    const location = await env.location();

    DEFAULT_BLOB_PERSISTENCE_ARRAY[0].locationPath = join(
      location,
      DEFAULT_BLOB_PERSISTENCE_PATH
    );
    AzuriteTelemetryClient.init(DEFAULT_BLOB_PERSISTENCE_ARRAY[0].locationPath, !env.disableTelemetry(), env.workspaceConfiguration, true);

    // Initialize server configuration
    const config = new BlobConfiguration(
      env.blobHost(),
      env.blobPort(),
      env.blobKeepAliveTimeout(),
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
      env.disableProductStyleUrl(),
      env.inMemoryPersistence(),
    );
    return config;
  }
}
