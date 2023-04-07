import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import { DEFAULT_SQL_OPTIONS } from "../../src/common/utils/constants";
import DataLakeConfiguration from "../../src/dfs/DataLakeConfiguration";
import DataLakeServer from "../../src/dfs/DataLakeServer";
import SqlDataLakeConfiguration from "../../src/dfs/SqlDataLakeConfiguration";
import SqlDataLakeServer from "../../src/dfs/SqlDataLakeServer";

export default class DataLakeTestServerFactory {
  public createServer(
    loose: boolean = false,
    skipApiVersionCheck: boolean = false,
    https: boolean = false,
    oauth?: string
  ): DataLakeServer | SqlDataLakeServer {
    let databaseConnectionString = process.env.AZURITE_TEST_DB;
    // if (databaseConnectionString?.startsWith("mysql")) {
    //   databaseConnectionString = "postgres://postgres:postgres@127.0.0.1:5432/azurite_dfs_test";
    // }
    const isSQL = databaseConnectionString !== undefined;

    const port = 11003;
    const host = "127.0.0.1";
    const persistenceArray: StoreDestinationArray = [
      {
        locationId: "test",
        locationPath: "__test_blob_extent__",
        maxConcurrency: 10
      }
    ];
    const cert = https ? "tests/server.cert" : undefined;
    const key = https ? "tests/server.key" : undefined;

    if (isSQL) {
      const config = new SqlDataLakeConfiguration(
        host,
        port + 100,
        databaseConnectionString!,
        DEFAULT_SQL_OPTIONS,
        persistenceArray,
        false,
        undefined,
        false,
        undefined,
        loose,
        skipApiVersionCheck,
        cert,
        key,
        undefined,
        oauth,
        false,
        true
      );

      return new SqlDataLakeServer(config);
    } else {
      const lokiMetadataDBPath = "__test_db_blob__.json";
      const lokiExtentDBPath = "__test_db_blob_extent__.json";
      const config = new DataLakeConfiguration(
        host,
        port,
        lokiMetadataDBPath,
        lokiExtentDBPath,
        persistenceArray,
        false,
        undefined,
        false,
        undefined,
        loose,
        skipApiVersionCheck,
        cert,
        key,
        undefined,
        oauth
      );
      return new DataLakeServer(config);
    }
  }
}
