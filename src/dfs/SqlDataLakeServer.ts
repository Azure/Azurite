
import DataLakeRequestListenerFactory from "./DataLakeRequestListenerFactory";
import SqlDataLakeMetadataStore from "./persistence/SqlDataLakeMetadataStore";
import SqlBlobConfiguration from "../blob/SqlBlobConfiguration";
import SqlBlobServer from "../blob/SqlBlobServer";


/**
 * Default implementation of Azurite DataLake HTTP server.
 * This implementation provides a HTTP service based on express framework and LokiJS in memory database.
 *
 * We can create other DataLake servers by extending abstract Server class and initialize different httpServer,
 * dataStore or requestListenerFactory fields.
 *
 * For example, creating a HTTPS server to accept HTTPS requests, or using other
 * Node.js HTTP frameworks like Koa, or just using another SQL database.
 *
 * @export
 * @class Server
 */
export default class SqlDataLakeServer extends SqlBlobServer {
  /**
   * Creates an instance of Server.
   *
   * @param {BlobConfiguration} configuration
   * @memberof Server
   */
  constructor(configuration: SqlBlobConfiguration) {
    super(configuration, SqlDataLakeMetadataStore, DataLakeRequestListenerFactory, "DataLake");
  }
}