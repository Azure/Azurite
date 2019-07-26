import { Options as SequelizeOptions } from "sequelize";

import ConfigurationBase from "../common/ConfigurationBase";
import { StoreDestinationArray } from "../common/persistence/IExtentStore";
import {
  DEFAULT_BLOB_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_PATH,
  DEFAULT_ENABLE_ACCESS_LOG,
  DEFAULT_ENABLE_DEBUG_LOG,
  DEFAULT_SERVER_HOST_NAME,
  DEFAULT_SERVER_LISTENING_PORT
} from "./utils/constants";

const DEFUALT_BLOB_PERSISTENCE_ARRAY: StoreDestinationArray = [
  {
    persistenceId: "Default",
    persistencePath: DEFAULT_BLOB_PERSISTENCE_PATH,
    maxConcurrency: 10
  }
];

const DEFUALT_SQL_URI =
  "mariadb://root:my-secret-pw@127.0.0.1:3306/azurite_extent_metadata";
const DEFUALT_SQL_OPTIONS = {
  logging: false,
  pool: {
    max: 100,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: {
    timezone: "Etc/GMT-0"
  }
};

/**
 * The configuraton for the server based on sql database.
 *
 * @export
 * @class SqlBlobConfiguration
 * @extends {ConfigurationBase}
 */
export default class SqlBlobConfiguration extends ConfigurationBase {
  public constructor(
    host: string = DEFAULT_SERVER_HOST_NAME,
    port: number = DEFAULT_SERVER_LISTENING_PORT,
    public readonly sqlURL: string = DEFUALT_SQL_URI,
    public readonly sequelizeOptions: SequelizeOptions = DEFUALT_SQL_OPTIONS,
    public readonly blobDBPath: string = DEFAULT_BLOB_DB_PATH,
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
