import ConfigurationBase from "../common/ConfigurationBase";
import {
  DEFAULT_ACCESS_LOG_PATH,
  DEFAULT_BLOB_PERSISTENCE_PATH,
  DEFAULT_DEBUG_LOG_PATH,
  DEFAULT_ENABLE_ACCESS_LOG,
  DEFAULT_ENABLE_DEBUG_LOG,
  DEFAULT_LOKI_DB_PATH,
  DEFAULT_SERVER_HOST_NAME,
  DEFAULT_SERVER_LISTENING_PORT
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
    host: string = DEFAULT_SERVER_HOST_NAME,
    port: number = DEFAULT_SERVER_LISTENING_PORT,
    public readonly dbPath: string = DEFAULT_LOKI_DB_PATH,
    public readonly persistencePath: string = DEFAULT_BLOB_PERSISTENCE_PATH,
    enableAccessLog: boolean = DEFAULT_ENABLE_ACCESS_LOG,
    accessLogFilePath: string = DEFAULT_ACCESS_LOG_PATH,
    enableDebugLog: boolean = DEFAULT_ENABLE_DEBUG_LOG,
    debugLogFilePath: string = DEFAULT_DEBUG_LOG_PATH
  ) {
    super(
      host,
      port,
      enableAccessLog,
      accessLogFilePath,
      enableDebugLog,
      debugLogFilePath
    );
  }
}
