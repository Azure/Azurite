import { access } from "fs";
import { join } from "path";
import rimraf = require("rimraf");
import { promisify } from "util";

import BlobConfiguration from "../blob/BlobConfiguration";
import BlobServer from "../blob/BlobServer";
import {
  DEFAULT_BLOB_PERSISTENCE_PATH,
  DEFAULT_LOKI_DB_PATH
} from "../blob/utils/constants";
import * as Logger from "./Logger";
import NoLoggerStrategy from "./NoLoggerStrategy";
import VSCChannelLoggerStrategy from "./VSCChannelLoggerStrategy";
import { VSCChannelWriteStream } from "./VSCChannelWriteStream";
import VSCEnvironment from "./VSCEnvironment";
import VSCServerManagerBase from "./VSCServerManagerBase";
import VSCServerManagerClosedState from "./VSCServerManagerClosedState";

const accessAsync = promisify(access);
const rimrafAsync = promisify(rimraf);

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
  }

  public async closeImpl(): Promise<void> {
    this.server!.close();
  }

  public async cleanImpl(): Promise<void> {
    const config = await this.getConfiguration();
    await rimrafAsync(config.dbPath);
    await rimrafAsync(config.persistencePath);
  }

  private async getConfiguration(): Promise<BlobConfiguration> {
    const env = new VSCEnvironment();
    const location = await env.location();
    await accessAsync(location);

    // Initialize server configuration
    const config = new BlobConfiguration(
      env.blobHost(),
      env.blobPort(),
      join(location, DEFAULT_LOKI_DB_PATH),
      join(location, DEFAULT_BLOB_PERSISTENCE_PATH),
      !env.silent(),
      this.accessChannelStream,
      env.debug() === true,
      undefined
    );
    return config;
  }
}
