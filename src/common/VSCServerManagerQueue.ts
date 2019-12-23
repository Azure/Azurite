import { access } from "fs";
import { join } from "path";
import { promisify } from "util";

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
import VSCEnvironment from "./VSCQueueEnvironment";
import VSCServerManagerBase from "./VSCServerManagerBase";
import VSCServerManagerClosedState from "./VSCServerManagerClosedState";

import rimraf = require("rimraf");
const accessAsync = promisify(access);
const rimrafAsync = promisify(rimraf);

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
  }

  public async closeImpl(): Promise<void> {
    this.server!.close();
  }

  public async cleanImpl(): Promise<void> {
    const config = await this.getConfiguration();
    await rimrafAsync(config.extentDBPath);
    await rimrafAsync(config.metadataDBPath);
    for (const path of config.persistencePathArray) {
      await rimrafAsync(path.locationPath);
    }
  }

  private async getConfiguration(): Promise<QueueConfiguration> {
    const env = new VSCEnvironment();
    const location = await env.location();
    await accessAsync(location);

    DEFAULT_QUEUE_PERSISTENCE_ARRAY[0].locationPath = join(
      location,
      DEFAULT_QUEUE_PERSISTENCE_PATH
    );

    // Initialize server configuration
    const config = new QueueConfiguration(
      env.queueHost(),
      env.queuePort(),
      join(location, DEFAULT_QUEUE_LOKI_DB_PATH),
      join(location, DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH),
      DEFAULT_QUEUE_PERSISTENCE_ARRAY,
      !env.silent(),
      this.accessChannelStream,
      env.debug() === true,
      undefined
    );
    return config;
  }
}
