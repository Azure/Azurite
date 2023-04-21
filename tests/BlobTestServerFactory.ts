import BlobConfiguration from "../src/blob/BlobConfiguration";
import BlobServer from "../src/blob/BlobServer";
import SqlBlobConfiguration from "../src/blob/SqlBlobConfiguration";
import SqlBlobServer from "../src/blob/SqlBlobServer";
import { StoreDestinationArray } from "../src/common/persistence/IExtentStore";
import { DEFAULT_SQL_OPTIONS } from "../src/common/utils/constants";
import DataLakeServer from "../src/dfs/DataLakeServer";
import SqlDataLakeServer from "../src/dfs/SqlDataLakeServer";

export default class BlobTestServerFactory {
  constructor(private readonly isDataLake: boolean = false) {}

  public createServer(
    loose: boolean = false,
    skipApiVersionCheck: boolean = false,
    https: boolean = false,
    oauth?: string,
  ): BlobServer | SqlBlobServer | DataLakeServer | SqlDataLakeServer {
    const isDataLake: boolean = process.env.IS_DATALAKE == "true"|| this.isDataLake;
    const databaseConnectionString = process.env.AZURITE_TEST_DB;
    const isSQL = databaseConnectionString !== undefined;

    const port = isDataLake ? 11003 : 11000;
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
      const config = new SqlBlobConfiguration(
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

      return isDataLake ? new SqlDataLakeServer(config) : new SqlBlobServer(config);
    } else {
      const lokiMetadataDBPath = "__test_db_blob__.json";
      const lokiExtentDBPath = "__test_db_blob_extent__.json";
      const config = new BlobConfiguration(
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
      return isDataLake ? new DataLakeServer(config) : new BlobServer(config);
    }
  }
}
