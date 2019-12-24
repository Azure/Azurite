import * as http from "http";

import AccountDataStore from "../common/AccountDataStore";
import IAccountDataStore from "../common/IAccountDataStore";
import ICleaner from "../common/ICleaner";
import IGCManager from "../common/IGCManager";
import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import FSExtentStore from "../common/persistence/FSExtentStore";
import IExtentMetadataStore from "../common/persistence/IExtentMetadataStore";
import IExtentStore from "../common/persistence/IExtentStore";
import LokiExtentMetadataStore from "../common/persistence/LokiExtentMetadataStore";
import ServerBase, { ServerStatus } from "../common/ServerBase";
import BlobConfiguration from "./BlobConfiguration";
import BlobRequestListenerFactory from "./BlobRequestListenerFactory";
import BlobGCManager from "./gc/BlobGCManager";
import IBlobMetadataStore from "./persistence/IBlobMetadataStore";
import LokiBlobMetadataStore from "./persistence/LokiBlobMetadataStore";

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
export default class BlobServer extends ServerBase implements ICleaner {
  private readonly metadataStore: IBlobMetadataStore;
  private readonly extentMetadataStore: IExtentMetadataStore;
  private readonly extentStore: IExtentStore;
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
    // creating a new XXXDataStore class implementing IBlobMetadataStore interface
    // and replace the default LokiBlobMetadataStore
    const metadataStore: IBlobMetadataStore = new LokiBlobMetadataStore(
      configuration.metadataDBPath
      // logger
    );

    const extentMetadataStore: IExtentMetadataStore = new LokiExtentMetadataStore(
      configuration.extentDBPath
    );

    const extentStore: IExtentStore = new FSExtentStore(
      extentMetadataStore,
      configuration.persistencePathArray,
      logger
    );

    const accountDataStore: IAccountDataStore = new AccountDataStore(logger);

    // We can also change the HTTP framework here by
    // creating a new XXXListenerFactory implementing IRequestListenerFactory interface
    // and replace the default Express based request listener
    const requestListenerFactory: IRequestListenerFactory = new BlobRequestListenerFactory(
      metadataStore,
      extentStore,
      accountDataStore,
      configuration.enableAccessLog, // Access log includes every handled HTTP request
      configuration.accessLogWriteStream,
      configuration.loose
    );

    super(host, port, httpServer, requestListenerFactory, configuration);

    // Default Blob GC Manager
    // Will close service when any critical GC error happens
    const gcManager = new BlobGCManager(
      metadataStore,
      extentMetadataStore,
      extentStore,
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

    this.metadataStore = metadataStore;
    this.extentMetadataStore = extentMetadataStore;
    this.extentStore = extentStore;
    this.accountDataStore = accountDataStore;
    this.gcManager = gcManager;
  }

  /**
   * Clean up server persisted data, including Loki metadata database file,
   * Loki extent database file and extent data.
   *
   * @returns {Promise<void>}
   * @memberof BlobServer
   */
  public async clean(): Promise<void> {
    if (this.getStatus() === ServerStatus.Closed) {
      if (this.extentStore !== undefined) {
        await this.extentStore.clean();
      }

      if (this.extentMetadataStore !== undefined) {
        await this.extentMetadataStore.clean();
      }

      if (this.metadataStore !== undefined) {
        await this.metadataStore.clean();
      }

      if (this.accountDataStore !== undefined) {
        await this.accountDataStore.clean();
      }
      return;
    }
    throw Error(`Cannot clean up blob server in status ${this.getStatus()}.`);
  }

  protected async beforeStart(): Promise<void> {
    const msg = `Azurite Blob service is starting on ${this.host}:${this.port}`;
    logger.info(msg);

    if (this.accountDataStore !== undefined) {
      await this.accountDataStore.init();
    }

    if (this.metadataStore !== undefined) {
      await this.metadataStore.init();
    }

    if (this.metadataStore !== undefined) {
      await this.extentMetadataStore.init();
    }

    if (this.extentStore !== undefined) {
      await this.extentStore.init();
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

    if (this.extentStore !== undefined) {
      await this.extentStore.close();
    }

    if (this.extentMetadataStore !== undefined) {
      await this.extentMetadataStore.close();
    }

    if (this.metadataStore !== undefined) {
      await this.metadataStore.close();
    }

    if (this.accountDataStore !== undefined) {
      await this.accountDataStore.close();
    }

    logger.info(AFTER_CLOSE_MESSAGE);
  }
}
