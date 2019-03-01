import * as http from "http";

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
export default class Server {
  public readonly port: number;
  public readonly host: string;
  private readonly dataStore: IDataStore;
  private readonly httpServer: http.Server;

  /**
   * Creates an instance of Server.
   *
   * @param {Configuration} configuration
   * @memberof Server
   */
  constructor(configuration: Configuration) {
    this.host = configuration.host;
    this.port = configuration.port;
    const dataStore = (this.dataStore = new LokiBlobDataStore(
      configuration.dbPath || DEFAULT_LOKI_DB_PATH,
      configuration.persistencePath || DEFAULT_BLOB_PERSISTENCE_PATH
    ));
    this.httpServer = http.createServer(getAPP(dataStore));
  }

  /**
   * Initialize resources server needed, such as database connections and other resources.
   *
   * @returns {Promise<void>}
   * @memberof Server
   */
  public async init(): Promise<void> {
    await this.dataStore.init();
  }

  /**
   * Starts HTTP server.
   *
   * @returns {Promise<void>}
   * @memberof Server
   */
  public async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.httpServer
        .listen(this.port, this.host, () => {
          let address = this.httpServer.address();
          if (typeof address !== "string") {
            address = address.address;
          }

          logger.info(
            `Azurite Blob service successfully listens on ${address}:${
              this.port
            }`
          );
          resolve();
        })
        .on("error", reject);
    });
  }

  /**
   * Close HTTP server, database connections or other resources.
   *
   * @returns {Promise<void>}
   * @memberof Server
   */
  public async close(): Promise<void> {
    logger.info(`Azurite Blob service is shutdown... Waiting for existing keep-alive connections timeout...`);

    // Close HTTP server first to deny incoming connections
    // You will find this will not close server immediately because there maybe existing keep-alive connections
    // Calling httpServer.close will only stop accepting incoming requests
    // and wait for existing keep-alive connections timeout
    // Default keep-alive timeout is 5 seconds defined by httpServer.keepAliveTimeout
    // TODO: Add a middleware to reject incoming request over existing keep-alive connections
    // https://github.com/nodejs/node/issues/2642
    await new Promise((resolve) => {
      this.httpServer.close(resolve);
    });

    await this.dataStore.close();
  }
}
