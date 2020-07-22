import ConfigurationBase from "../common/ConfigurationBase";
import {
  DEFAULT_ENABLE_ACCESS_LOG,
  DEFAULT_ENABLE_DEBUG_LOG,
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_LOKI_DB_PATH,
  DEFAULT_TABLE_SERVER_HOST_NAME
} from "./utils/constants";

/**
 * Default configurations for default implementation of TableServer.
 *
 * As default implementation of TableServer class leverages LokiJS DB.
 * This configuration class also maintains configuration settings for LokiJS DB.
 *
 * When creating other server implementations, should also create a NEW
 * corresponding configuration class by extending ConfigurationBase.
 *
 * @export
 * @class Configuration
 */

export default class TableConfiguration extends ConfigurationBase {
  public constructor(
    host: string = DEFAULT_TABLE_SERVER_HOST_NAME,
    port: number = DEFAULT_TABLE_LISTENING_PORT,
    public readonly /* Store metadata */ metadataDBPath: string = DEFAULT_TABLE_LOKI_DB_PATH,
    enableAccessLog: boolean = DEFAULT_ENABLE_ACCESS_LOG,
    accessLogWriteStream?: NodeJS.WritableStream,
    enableDebugLog: boolean = DEFAULT_ENABLE_DEBUG_LOG,
    debugLogFilePath?: string,
    loose: boolean = false,
    skipApiVersionCheck: boolean = false,
    cert: string = "",
    key: string = "",
    pwd: string = "",
    oauth?: string
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
      oauth
    );
  }
}
