import logger from "../common/Logger";
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

  public addEvent(event: any): void {
      this.dataStore.insertTableEntity(this.table, this.account, event as Entity);
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
    const events = (await this.dataStore.queryTableEntities(this.account, this.table)) as Entity[];
    const groupedByOp = this.groupEventsByParameter(events, 'operation');
    const groupedByDB = this.groupEventsByParameter(events, 'dbType');
    console.log('Operations grouped by Op is: ', groupedByOp);
    console.log('Operations grouped by DB is: ', groupedByDB);
    
    this.dataStore.close();
  }

  private groupEventsByParameter(events: Entity[], param: string) {
    const groupedByOp = events.reduce((acc, event: Entity) => {
      const paramValue = event[param];
      if(!acc[paramValue]) {
        acc[paramValue] = {input: 0, output: 0, counts: 0};
      }
      acc[paramValue] = {
        input: acc[paramValue]['input'] + (event.inputLen || 0),
        output: acc[paramValue]['output'] + (event.outputLen || 0),
        counts: acc[paramValue]['counts'] + 1
      }
      return acc;
    }, {} as {[key: string]: any});

    return groupedByOp;
  }
}
