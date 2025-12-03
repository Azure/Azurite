import { join } from "path";

import { BlobServerFactory } from "../blob/BlobServerFactory";
import LokiAccountModelStore from "./account/LokiAccountModelStore";
import { DEFAULT_ACCOUNT_MODEL_LOKI_DB_PATH } from "../blob/utils/constants";
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
    const env = new VSCEnvironment();
    const location = await env.location();
    
    // Create account model store
    const accountModels = env.getAccountModels();
    const accountModelStore = new LokiAccountModelStore(
      join(location, DEFAULT_ACCOUNT_MODEL_LOKI_DB_PATH),
      env.inMemoryPersistence(),
      accountModels
    );
    
    await accountModelStore.init();
    const blobServerFactory = new BlobServerFactory();
    this.server = await blobServerFactory.createServer(env, accountModelStore);
    
    const config = this.server.config;
    Logger.default.strategy = config.enableDebugLog
      ? this.debuggerLoggerStrategy
      : new NoLoggerStrategy();
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
}
