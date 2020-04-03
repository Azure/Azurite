import * as http from "http";
import * as https from "https";

import AccountDataStore from "../common/AccountDataStore";
import { CertOptions } from "../common/ConfigurationBase";
import IAccountDataStore from "../common/IAccountDataStore";
import IGCManager from "../common/IGCManager";
import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import FSExtentStore from "../common/persistence/FSExtentStore";
import IExtentMetadataStore from "../common/persistence/IExtentMetadataStore";
import IExtentStore from "../common/persistence/IExtentStore";
import LokiExtentMetadataStore from "../common/persistence/LokiExtentMetadataStore";
import ServerBase from "../common/ServerBase";
import QueueGCManager from "./gc/QueueGCManager";
import IQueueMetadataStore from "./persistence/IQueueMetadataStore";
import LokiQueueMetadataStore from "./persistence/LokiQueueMetadataStore";
import QueueConfiguration from "./QueueConfiguration";
import QueueRequestListenerFactory from "./QueueRequestListenerFactory";

const BEFORE_CLOSE_MESSAGE = `Azurite Queue service is closing...`;
const BEFORE_CLOSE_MESSAGE_GC_ERROR = `Azurite Queue service is closing... Critical error happens during GC.`;
const AFTER_CLOSE_MESSAGE = `Azurite Queue service successfully closed`;

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
export default class QueueServer extends ServerBase {
  private readonly metadataStore: IQueueMetadataStore;
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
  constructor(configuration?: QueueConfiguration) {
    if (configuration === undefined) {
      configuration = new QueueConfiguration();
    }

    const host = configuration.host;
    const port = configuration.port;

    // We can create a HTTP server or a HTTPS server here
    let httpServer;
    const certOption = configuration.hasCert();
    switch (certOption) {
      case CertOptions.PEM:
      case CertOptions.PFX:
        httpServer = https.createServer(configuration.getCert(certOption)!);
        break;
      default:
        httpServer = http.createServer();
    }

    // We can change the persistency layer implementation by
    // creating a new XXXDataStore class implementing IBlobDataStore interface
    // and replace the default LokiBlobDataStore
    const metadataStore: IQueueMetadataStore = new LokiQueueMetadataStore(
      configuration.metadataDBPath
      // logger
    );

    const extentMetadataStore = new LokiExtentMetadataStore(
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
    const requestListenerFactory: IRequestListenerFactory = new QueueRequestListenerFactory(
      metadataStore,
      extentStore,
      accountDataStore,
      configuration.enableAccessLog, // Access log includes every handled HTTP request
      configuration.accessLogWriteStream
    );

    super(host, port, httpServer, requestListenerFactory, configuration);

    const gcManager = new QueueGCManager(
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

  protected async beforeStart(): Promise<void> {
    const msg = `Azurite Queue service is starting on ${this.host}:${this.port}`;
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
    const msg = `Azurite Queue service successfully listens on ${this.getHttpServerAddress()}`;
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
