import ICleaner from "../common/ICleaner";
import LokiDataLakeMetadataStore from "./persistence/LokiDataLakeMetadataStore";
import DataLakeRequestListenerFactory from "./DataLakeRequestListenerFactory";
import BlobConfiguration from "../blob/BlobConfiguration";
import { DEFAULT_DATA_LAKE_LISTENING_PORT, DEFAULT_DATA_LAKE_SERVER_HOST_NAME } from "./utils/constants";
import BlobServer from "../blob/BlobServer";


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
export default class DataLakeServer extends BlobServer implements ICleaner {
  /**
   * Creates an instance of Server.
   *
   * @param {BlobConfiguration} configuration
   * @memberof Server
   */
  constructor(configuration?: BlobConfiguration) {
    if (configuration === undefined) {
      configuration = new BlobConfiguration(
        DEFAULT_DATA_LAKE_SERVER_HOST_NAME, 
        DEFAULT_DATA_LAKE_LISTENING_PORT
      );
    }

    super(configuration, LokiDataLakeMetadataStore, DataLakeRequestListenerFactory, "DataLake");
  }
}
