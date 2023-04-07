import ConfigurationBase from "../common/ConfigurationBase";
import { StoreDestinationArray } from "../common/persistence/IExtentStore";
import {
  DEFAULT_DATA_LAKE_EXTENT_LOKI_DB_PATH,
  DEFAULT_DATA_LAKE_LISTENING_PORT,
  DEFAULT_DATA_LAKE_LOKI_DB_PATH,
  DEFAULT_DATA_LAKE_PERSISTENCE_ARRAY,
  DEFAULT_DATA_LAKE_SERVER_HOST_NAME,
  DEFAULT_ENABLE_ACCESS_LOG,
  DEFAULT_ENABLE_DEBUG_LOG
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
export default class DataLakeConfiguration extends ConfigurationBase {
  public constructor(
    host: string = DEFAULT_DATA_LAKE_SERVER_HOST_NAME,
    port: number = DEFAULT_DATA_LAKE_LISTENING_PORT,
    public readonly metadataDBPath: string = DEFAULT_DATA_LAKE_LOKI_DB_PATH,
    public readonly extentDBPath: string = DEFAULT_DATA_LAKE_EXTENT_LOKI_DB_PATH,
    public readonly persistencePathArray: StoreDestinationArray = DEFAULT_DATA_LAKE_PERSISTENCE_ARRAY,
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
    disableProductStyleUrl: boolean = false
  ) {
    super(
      host,
      port,
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
