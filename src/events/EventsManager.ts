import logger from "../common/Logger";
import Context from "./generated/Context";
import IEventsManager from "./IEventsManager";
import IEventsMetadataStore, { Entity } from "./persistence/IEventsMetadataStore";
import LokiEventsMetadataStore from "./persistence/LokiEventsMetadataStore";
import { DEFAULT_EVENTS_TABLE_LOKI_DB_PATH } from "./utils/constants";

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
export default class EventsManager implements IEventsManager {
  private readonly dataStore: IEventsMetadataStore;
  private readonly account: string = "testingAccount";
  private readonly table: string = "eventsData";

  constructor(dbPath?: string) {
    if (dbPath === undefined) {
      dbPath = DEFAULT_EVENTS_TABLE_LOKI_DB_PATH;
    }

    // Create **dataStore with Loki.js
    this.dataStore = new LokiEventsMetadataStore(dbPath);
    this.start();
  }

  public addEvent(context: any, meta: any): void {
      this.dataStore.insertTableEntity(context as Context, this.table, this.account, meta as Entity);
  }

  protected async start(): Promise<void> {
    const msg = `Events Manager is starting`;
    logger.info(msg);

    if (this.dataStore !== undefined) {
      await this.dataStore.init();
    }
    this.dataStore.createTable({account: this.account, table: this.table});
  }

  public async close(): Promise<void> {
    this.dataStore.close();
  }

}
