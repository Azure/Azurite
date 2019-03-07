import * as http from "http";

import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import ServerBase from "../common/ServerBase";
import BlobConfiguration from "./BlobConfiguration";
import BlobRequestListenerFactory from "./BlobRequestListenerFactory";
import IBlobDataStore from "./persistence/IBlobDataStore";
import LokiBlobDataStore from "./persistence/LokiBlobDataStore";

/**
 * Default implementation of Azurite Blob HTTP server.
 * This implementation provides a HTTP service based on express framework and LokiJS in memory database.
 *
 * We can create other blob servers by extending abstract Server class and initialize different httpServer,
 * dataStore or requestListenerFactory fields.
 *
 * For example, creating a HTTPS server to accept HTTPS requests, or using other
 * Node.js HTTP frameworks like Koa, or just using another SQL database.
 *
 * @export
 * @class Server
 */
export default class BlobServer extends ServerBase {
  /**
   * Creates an instance of Server.
   *
   * @param {BlobConfiguration} configuration
   * @memberof Server
   */
  constructor(configuration?: BlobConfiguration) {
    if (configuration === undefined) {
      configuration = new BlobConfiguration();
    }

    const host = configuration.host;
    const port = configuration.port;

    // We can crate a HTTP server or a HTTPS server here
    const httpServer = http.createServer();

    // We can change the persistency layer implementation by
    // creating a new XXXDataStore class implementing IBlobDataStore interface
    // and replace the default LokiBlobDataStore
    const dataStore: IBlobDataStore = new LokiBlobDataStore(
      configuration.dbPath,
      configuration.persistencePath
    );

    // We can also change the HTTP framework here by
    // creating a new XXXListenerFactory implementing IRequestListenerFactory interface
    // and replace the default Express based request listener
    const requestListenerFactory: IRequestListenerFactory = new BlobRequestListenerFactory(
      dataStore,
      configuration.enableAccessLog // Access log will display every request served
    );

    super(host, port, httpServer, requestListenerFactory, dataStore);
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
}
