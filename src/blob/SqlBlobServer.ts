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
import SqlExtentMetadataStore from "../common/persistence/SqlExtentMetadataStore";
import ServerBase, { ServerStatus } from "../common/ServerBase";
import BlobRequestListenerFactory from "./BlobRequestListenerFactory";
import BlobGCManager from "./gc/BlobGCManager";
import IBlobMetadataStore from "./persistence/IBlobMetadataStore";
import SqlBlobMetadataStore from "./persistence/SqlBlobMetadataStore";
import SqlBlobConfiguration from "./SqlBlobConfiguration";

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
export default class SqlBlobServer extends ServerBase {
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
  constructor(configuration: SqlBlobConfiguration) {
    const host = configuration.host;
    const port = configuration.port;

    // We can crate a HTTP server or a HTTPS server here
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

    const metadataStore: IBlobMetadataStore = new SqlBlobMetadataStore(
      configuration.sqlURL,
      configuration.sequelizeOptions
    );

    const extentMetadataStore: IExtentMetadataStore = new SqlExtentMetadataStore(
      // Currently, extent metadata and blob metadata share same database
      // But they can use separate databases per future requirements
      configuration.sqlURL,
      configuration.sequelizeOptions
    );

    const extentStore: IExtentStore = new FSExtentStore(
      extentMetadataStore,
      configuration.persistenceArray,
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
      configuration.loose,
      configuration.skipApiVersionCheck,
      configuration.getOAuthLevel(),
      configuration.disableProductStyleUrl
    );

    super(host, port, httpServer, requestListenerFactory, configuration);

    // Default Blob GC Manager
    // Will close service when any critical GC error happens
    const gcManager = new BlobGCManager(
      metadataStore,
      extentMetadataStore,
      extentStore,
      error => {
        // tslint:disable-next-line:no-console
        console.log(BEFORE_CLOSE_MESSAGE_GC_ERROR, error);
        logger.info(BEFORE_CLOSE_MESSAGE_GC_ERROR + JSON.stringify(error));

        // TODO: Bring this back when GC based on SQL implemented
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
   * Clean up server persisted extent data.
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

    if (this.extentMetadataStore !== undefined) {
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
