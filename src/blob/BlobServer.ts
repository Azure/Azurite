import * as http from "http";
import * as https from "https";

import AccountDataStore from "../common/AccountDataStore";
import { CertOptions } from "../common/ConfigurationBase";
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
import { DEFAULT_BLOB_LISTENING_PORT, DEFAULT_BLOB_SERVER_HOST_NAME } from "./utils/constants";

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
  private readonly BEFORE_CLOSE_MESSAGE;
  private readonly BEFORE_CLOSE_MESSAGE_GC_ERROR;
  private readonly AFTER_CLOSE_MESSAGE;

  /**
   * Creates an instance of Server.
   *
   * @param {BlobConfiguration} configuration
   * @memberof Server
   */
  constructor(
    configuration?: BlobConfiguration, 
    metadataStoreClass: any = LokiBlobMetadataStore,
    requestListnerFactory: any = BlobRequestListenerFactory,
    private readonly serviceName: string = "Blob"
  ) {
    if (configuration === undefined) {
      configuration = new BlobConfiguration(
        DEFAULT_BLOB_SERVER_HOST_NAME, 
        DEFAULT_BLOB_LISTENING_PORT
      )
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
    // creating a new XXXDataStore class implementing IBlobMetadataStore interface
    // and replace the default LokiBlobMetadataStore
    const metadataStore: IBlobMetadataStore = new metadataStoreClass(
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
    const requestListenerFactory: IRequestListenerFactory = new requestListnerFactory(
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
      () => {
        // tslint:disable-next-line:no-console
        console.log(this.BEFORE_CLOSE_MESSAGE_GC_ERROR);
        logger.info(this.BEFORE_CLOSE_MESSAGE_GC_ERROR);
        this.close().then(() => {
          // tslint:disable-next-line:no-console
          console.log(this.AFTER_CLOSE_MESSAGE);
          logger.info(this.AFTER_CLOSE_MESSAGE);
        });
      },
      logger
    );

    this.BEFORE_CLOSE_MESSAGE = `Azurite ${serviceName} service is closing...`;
    this.BEFORE_CLOSE_MESSAGE_GC_ERROR = `Azurite ${serviceName} service is closing... Critical error happens during GC.`;
    this.AFTER_CLOSE_MESSAGE = `Azurite ${serviceName} service successfully closed`;
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
    throw Error(`Cannot clean up ${this.serviceName} server in status ${this.getStatus()}.`);
  }

  protected async beforeStart(): Promise<void> {
    const msg = `Azurite ${this.serviceName} service is starting on ${this.host}:${this.port}`;
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
    const msg = `Azurite ${this.serviceName} service successfully listens on ${this.getHttpServerAddress()}`;
    logger.info(msg);
  }

  protected async beforeClose(): Promise<void> {
    logger.info(this.BEFORE_CLOSE_MESSAGE);
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

    logger.info(this.AFTER_CLOSE_MESSAGE);
  }
}
