import { join } from "path";
import IDataLakeEnvironment from "./IDataLakeEnvironment";
import DataLakeServer from "./DataLakeServer";
import SqlDataLakeServer from "./SqlDataLakeServer";
import DataLakeEnvironment from "./DataLakeEnvironment";
import { DEFAULT_SQL_OPTIONS } from "../common/utils/constants";
import SqlDataLakeConfiguration from "./SqlDataLakeConfiguration";
import DataLakeConfiguration from "./DataLakeConfiguration";
import {
  DEFAULT_DATA_LAKE_EXTENT_LOKI_DB_PATH,
  DEFAULT_DATA_LAKE_LOKI_DB_PATH,
  DEFAULT_DATA_LAKE_PERSISTENCE_ARRAY,
  DEFAULT_DATA_LAKE_PERSISTENCE_PATH
} from "./utils/constants";

export class DataLakeServerFactory {
  public async createServer(
    blobEnvironment?: IDataLakeEnvironment
  ): Promise<DataLakeServer | SqlDataLakeServer> {
    // TODO: Check it's in Visual Studio Code environment or not
    const isVSC = false;

    if (!isVSC) {
      const env = blobEnvironment ? blobEnvironment : new DataLakeEnvironment();
      const location = await env.location();
      const debugFilePath = await env.debug();

      if (typeof debugFilePath === "boolean") {
        throw RangeError(
          `Must provide a debug log file path for parameter -d or --debug`
        );
      }

      DEFAULT_DATA_LAKE_PERSISTENCE_ARRAY[0].locationPath = join(
        location,
        DEFAULT_DATA_LAKE_PERSISTENCE_PATH
      );

      // TODO: Check we need to create blob server against SQL or Loki
      const databaseConnectionString = process.env.AZURITE_DATALAKE_DB;
      const isSQL = databaseConnectionString !== undefined;

      if (isSQL) {
        const config = new SqlDataLakeConfiguration(
          env.datalakeHost(),
          env.datalakePort(),
          databaseConnectionString!,
          DEFAULT_SQL_OPTIONS,
          DEFAULT_DATA_LAKE_PERSISTENCE_ARRAY,
          !env.silent(),
          undefined,
          debugFilePath !== undefined,
          debugFilePath,
          env.loose(),
          env.skipApiVersionCheck(),
          env.cert(),
          env.key(),
          env.pwd(),
          env.oauth(),
          env.disableProductStyleUrl()
        );

        return new SqlDataLakeServer(config);
      } else {
        const config = new DataLakeConfiguration(
          env.datalakeHost(),
          env.datalakePort(),
          join(location, DEFAULT_DATA_LAKE_LOKI_DB_PATH),
          join(location, DEFAULT_DATA_LAKE_EXTENT_LOKI_DB_PATH),
          DEFAULT_DATA_LAKE_PERSISTENCE_ARRAY,
          !env.silent(),
          undefined,
          debugFilePath !== undefined,
          debugFilePath,
          env.loose(),
          env.skipApiVersionCheck(),
          env.cert(),
          env.key(),
          env.pwd(),
          env.oauth(),
          env.disableProductStyleUrl()
        );
        return new DataLakeServer(config);
      }
    } else {
      // TODO: Add BlobServer construction in VSC
      // Visual Studio Code Loki
      // Visual Studio Code SQL
      throw new Error("Not implemented.");
    }
  }
}
