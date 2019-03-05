import * as http from "http";

import Server from "../common/IServer";
import getAPP from "./app";
import Configuration from "./Configuration";
import { IDataStore } from "./persistence/IDataStore";
import LokiBlobDataStore from "./persistence/LokiBlobDataStore";
import { DEFAULT_BLOB_PERSISTENCE_PATH, DEFAULT_LOKI_DB_PATH } from "./utils/constants";
import logger from "./utils/log/Logger";

// Decouple server & app layer
// Server layer should only care about sever related configurations, like listening port etc.
// App layer will handle middleware related things

/**
 * Azurite HTTP server.
 *
 * @export
 * @class Server
 */
export default class BlobServer extends Server {
  private readonly dataStore: IDataStore;

  /**
   * Creates an instance of Server.
   *
   * @param {Configuration} configuration
   * @memberof Server
   */
  constructor(configuration: Configuration) {
    const host = configuration.host;
    const port = configuration.port;
    const dataStore = new LokiBlobDataStore(
      configuration.dbPath || DEFAULT_LOKI_DB_PATH,
      configuration.persistencePath || DEFAULT_BLOB_PERSISTENCE_PATH
    );
    const httpServer = http.createServer(getAPP(dataStore));

    super(host, port, httpServer);
    this.dataStore = dataStore;
  }

  protected async beforeStart(): Promise<void> {
    await this.dataStore.init();
  }

  protected async afterStart(): Promise<void> {
    let address = this.httpServer.address();
    if (typeof address !== "string") {
      address = address.address;
    }

    logger.info(
      `Azurite Blob service successfully listens on ${address}:${this.port}`
    );
  }
  protected async beforeClose(): Promise<void> {
    logger.info(
      `Azurite Blob service is shutdown... Waiting for existing keep-alive connections timeout...`
    );
  }

  protected async afterClose(): Promise<void> {
    await this.dataStore.close();
  }
}
