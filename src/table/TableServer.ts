import * as http from "http";
import * as https from "https";

import AccountDataStore from "../common/AccountDataStore";
import { CertOptions } from "../common/ConfigurationBase";
import IAccountDataStore from "../common/IAccountDataStore";
import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import ITableMetadataStore from "../table/persistence/ITableMetadataStore";
import LokiTableMetadataStore from "../table/persistence/LokiTableMetadataStore";

import ServerBase, { ServerStatus } from "../common/ServerBase";
import TableConfiguration from "./TableConfiguration";
import TableRequestListenerFactory from "./TableRequestListenerFactory";

/**
 * Default implementation of Azurite Table HTTP server.
 * This implementation provides a HTTP service based on express framework and LokiJS in memory database.
 *
 * We can create other table servers by extending abstract Server class and initialize different httpServer,
 * dataStore or requestListenerFactory fields.
 *
 * For example, creating a HTTPS server to accept HTTPS requests, or using other
 * Node.js HTTP frameworks like Koa, or just using another SQL database.
 *
 * @export
 * @class Server
 */
export default class TableServer extends ServerBase {
  private readonly /* Store the metadata of the table service */ metadataStore: ITableMetadataStore;
  private readonly /* Store the account data */ accountDataStore: IAccountDataStore;

  constructor(configuration?: TableConfiguration) {
    // If configuration is undefined, we'll use the default one
    if (configuration === undefined) {
      configuration = new TableConfiguration();
    }

    // Create a http server to accept table operation request
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

    // Create **dataStore with Loki.js
    const metadataStore: ITableMetadataStore = new LokiTableMetadataStore(
      configuration.metadataDBPath,
      configuration.isMemoryPersistence
    );
    const accountDataStore: IAccountDataStore = new AccountDataStore(logger);

    // Here we use express request listener and register table handler
    const requestListenerFactory: IRequestListenerFactory = new TableRequestListenerFactory(
      metadataStore,
      accountDataStore,
      configuration.enableAccessLog, // Access log includes every handled HTTP request
      configuration.accessLogWriteStream,
      configuration.skipApiVersionCheck,
      configuration.getOAuthLevel(),
      configuration.disableProductStyleUrl
    );

    const host = configuration.host;
    const port = configuration.port;
    super(host, port, httpServer, requestListenerFactory, configuration);

    this.metadataStore = metadataStore;
    this.accountDataStore = accountDataStore;
  }

  public async clean(): Promise<void> {
    if (this.getStatus() === ServerStatus.Closed) {
      if (this.metadataStore !== undefined) {
        await this.metadataStore.clean();
      }

      if (this.accountDataStore !== undefined) {
        await this.accountDataStore.clean();
      }
      return;
    }
    throw Error(`Cannot clean up table server in status ${this.getStatus()}.`);
  }

  protected async beforeStart(): Promise<void> {
    const msg = `Azurite Table service is starting on ${this.host}:${this.port}`;
    logger.info(msg);

    if (this.accountDataStore !== undefined) {
      await this.accountDataStore.init();
    }

    if (this.metadataStore !== undefined) {
      await this.metadataStore.init();
    }
  }

  protected async afterStart(): Promise<void> {
    const msg = `Azurite Table service successfully listens on ${this.getHttpServerAddress()}`;
    logger.info(msg);
  }

  protected async beforeClose(): Promise<void> {
    const BEFORE_CLOSE_MESSAGE = `Azurite Table service is closing...`;
    logger.info(BEFORE_CLOSE_MESSAGE);
  }

  protected async afterClose(): Promise<void> {
    if (this.metadataStore !== undefined) {
      await this.metadataStore.close();
    }

    if (this.accountDataStore !== undefined) {
      await this.accountDataStore.close();
    }

    const AFTER_CLOSE_MESSAGE = `Azurite Table service successfully closed`;
    logger.info(AFTER_CLOSE_MESSAGE);
  }
}
