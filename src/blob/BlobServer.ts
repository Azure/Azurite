import * as http from "http";

import AccountDataStore from "../common/AccountDataStore";
import IAccountDataStore from "../common/IAccountDataStore";
import IGCManager from "../common/IGCManager";
import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import ServerBase from "../common/ServerBase";
import BlobConfiguration from "./BlobConfiguration";
import BlobRequestListenerFactory from "./BlobRequestListenerFactory";
import BlobGCManager from "./gc/BlobGCManager";
import IBlobDataStore from "./persistence/IBlobDataStore";
import LokiBlobDataStore from "./persistence/LokiBlobDataStore";

const BEFORE_CLOSE_MESSAGE = `Azurite Blob service is closing...`;
const BEFORE_CLOSE_MESSAGE_GC_ERROR = `Azurite Blob service is closing... Critical error happens during GC.`;
const AFTER_CLOSE_MESSAGE = `Azurite Blob service successfully closed`;

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
  private readonly dataStore: IBlobDataStore;
  private readonly accountDataStore: IAccountDataStore;
  private readonly gcManager: IGCManager;

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

    const accountDataStore: IAccountDataStore = new AccountDataStore();

    // We can also change the HTTP framework here by
    // creating a new XXXListenerFactory implementing IRequestListenerFactory interface
    // and replace the default Express based request listener
    const requestListenerFactory: IRequestListenerFactory = new BlobRequestListenerFactory(
      dataStore,
      accountDataStore,
      configuration.enableAccessLog // Access log includes every handled HTTP request
    );

    super(host, port, httpServer, requestListenerFactory);

    // Default Blob GC Manager
    // Will close service when any critical GC error happens
    const gcManager = new BlobGCManager(
      dataStore,
      () => {
        // tslint:disable-next-line:no-console
        console.log(BEFORE_CLOSE_MESSAGE_GC_ERROR);
        logger.info(BEFORE_CLOSE_MESSAGE_GC_ERROR);
        this.close().then(() => {
          // tslint:disable-next-line:no-console
          console.log(AFTER_CLOSE_MESSAGE);
          logger.info(AFTER_CLOSE_MESSAGE);
        });
      },
      logger
    );

    this.dataStore = dataStore;
    this.accountDataStore = accountDataStore;
    this.gcManager = gcManager;
  }

  protected async beforeStart(): Promise<void> {
    const msg = `Azurite Blob service is starting on ${this.host}:${this.port}`;
    logger.info(msg);

    if (this.accountDataStore !== undefined) {
      await this.accountDataStore.init();
    }

    if (this.dataStore !== undefined) {
      await this.dataStore.init();
    }

    if (this.gcManager !== undefined) {
      await this.gcManager.start();
    }
  }

  protected async afterStart(): Promise<void> {
    const msg = `Azurite Blob service successfully listens on ${this.getHttpServerAddress()}`;
    logger.info(msg);
  }

  protected async beforeClose(): Promise<void> {
    logger.info(BEFORE_CLOSE_MESSAGE);
  }

  protected async afterClose(): Promise<void> {
    if (this.gcManager !== undefined) {
      await this.gcManager.close();
    }

    if (this.dataStore !== undefined) {
      await this.dataStore.close();
    }

    if (this.accountDataStore !== undefined) {
      await this.accountDataStore.close();
    }

    logger.info(AFTER_CLOSE_MESSAGE);
  }
}
