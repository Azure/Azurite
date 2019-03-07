import ConfigurationBase from "../common/ConfigurationBase";
import {
  DEFAULT_BLOB_PERSISTENCE_PATH,
  DEFAULT_LOKI_DB_PATH,
  DEFAULT_SERVER_HOST_NAME,
  DEFAULT_SERVER_LISTENING_PORT,
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
  public readonly dbPath: string;
  public readonly persistencePath: string;

  // TODO: Add an overload constructor to parsing configurations from command line arguments or environment variables
  public constructor(
    host?: string,
    port?: number,
    dbPath?: string,
    persistencePath?: string
  ) {
    super(
      host || DEFAULT_SERVER_HOST_NAME,
      port || DEFAULT_SERVER_LISTENING_PORT,
      true,
      undefined,
      true,
      undefined
    );
    this.dbPath = dbPath || DEFAULT_LOKI_DB_PATH;
    this.persistencePath = persistencePath || DEFAULT_BLOB_PERSISTENCE_PATH;
  }
}
