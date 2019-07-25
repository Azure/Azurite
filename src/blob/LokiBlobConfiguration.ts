import ConfigurationBase from "../common/ConfigurationBase";
import { StoreDestinationArray } from "../common/persistence/IExtentStore";
import {
  DEFAULT_BLOB_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_PATH,
  DEFAULT_ENABLE_ACCESS_LOG,
  DEFAULT_ENABLE_DEBUG_LOG,
  DEFAULT_EXTENT_DB_PATH,
  DEFAULT_SERVER_HOST_NAME,
  DEFAULT_SERVER_LISTENING_PORT
} from "./utils/constants";

const DEFUALT_BLOB_PERSISTENCE_ARRAY: StoreDestinationArray = [
  {
    persistencyId: "Default",
    persistencyPath: DEFAULT_BLOB_PERSISTENCE_PATH,
    maxConcurrency: 1
  }
];

/**
 * A default implementation of BlobServer class leverages LokiJS DB.
 * This configuration class also maintains configuration settings for LokiJS DB.
 *
 * When creating other server implementations, should also create a NEW
 * corresponding configuration class by extending ConfigurationBase.
 *
 * @export
 * @class LokiBlobConfiguration
 * @extends {ConfigurationBase}
 */
export default class LokiBlobConfiguration extends ConfigurationBase {
  public constructor(
    host: string = DEFAULT_SERVER_HOST_NAME,
    port: number = DEFAULT_SERVER_LISTENING_PORT,
    public readonly blobDBPath: string = DEFAULT_BLOB_DB_PATH,
    public readonly extentDBPath: string = DEFAULT_EXTENT_DB_PATH,
    public readonly persistenceArray: StoreDestinationArray = DEFUALT_BLOB_PERSISTENCE_ARRAY,
    enableAccessLog: boolean = DEFAULT_ENABLE_ACCESS_LOG,
    accessLogWriteStream?: NodeJS.WritableStream,
    enableDebugLog: boolean = DEFAULT_ENABLE_DEBUG_LOG,
    debugLogFilePath?: string
  ) {
    super(
      host,
      port,
      enableAccessLog,
      accessLogWriteStream,
      enableDebugLog,
      debugLogFilePath
    );
  }
}
