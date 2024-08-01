import ConfigurationBase from "../common/ConfigurationBase";
import { StoreDestinationArray } from "../common/persistence/IExtentStore";
import { MemoryExtentChunkStore } from "../common/persistence/MemoryExtentStore";
import {
  DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
  DEFAULT_BLOB_LISTENING_PORT,
  DEFAULT_BLOB_LOKI_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_ARRAY,
  DEFAULT_BLOB_SERVER_HOST_NAME,
  DEFAULT_ENABLE_ACCESS_LOG,
  DEFAULT_ENABLE_DEBUG_LOG,
  DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT
} from "./utils/constants";

/**
 * Default configurations for default implementation of BlobServer.
 *
 * As default implementation of BlobServer class leverages LokiJS DB.
 * This configuration class also maintains configuration settings for LokiJS DB.
 *
 * When creating other server implementations, should also create a NEW
 * corresponding configuration class by extending ConfigurationBase.
 *
 * @export
 * @class Configuration
 */
export default class BlobConfiguration extends ConfigurationBase {
  public constructor(
    host: string = DEFAULT_BLOB_SERVER_HOST_NAME,
    port: number = DEFAULT_BLOB_LISTENING_PORT,
    keepAliveTimeout: number = DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
    public readonly metadataDBPath: string = DEFAULT_BLOB_LOKI_DB_PATH,
    public readonly extentDBPath: string = DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
    public readonly persistencePathArray: StoreDestinationArray = DEFAULT_BLOB_PERSISTENCE_ARRAY,
    enableAccessLog: boolean = DEFAULT_ENABLE_ACCESS_LOG,
    accessLogWriteStream?: NodeJS.WritableStream,
    enableDebugLog: boolean = DEFAULT_ENABLE_DEBUG_LOG,
    debugLogFilePath?: string,
    loose: boolean = false,
    skipApiVersionCheck: boolean = false,
    cert: string = "",
    key: string = "",
    pwd: string = "",
    oauth?: string,
    disableProductStyleUrl: boolean = false,
    public readonly isMemoryPersistence: boolean = false,
    public readonly memoryStore?: MemoryExtentChunkStore,
  ) {
    super(
      host,
      port,
      keepAliveTimeout,
      enableAccessLog,
      accessLogWriteStream,
      enableDebugLog,
      debugLogFilePath,
      loose,
      skipApiVersionCheck,
      cert,
      key,
      pwd,
      oauth,
      disableProductStyleUrl
    );
  }
}
