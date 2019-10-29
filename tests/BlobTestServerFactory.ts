import BlobConfiguration from "../src/blob/BlobConfiguration";
import BlobServer from "../src/blob/BlobServer";
import SqlBlobConfiguration from "../src/blob/SqlBlobConfiguration";
import SqlBlobServer from "../src/blob/SqlBlobServer";
import { StoreDestinationArray } from "../src/common/persistence/IExtentStore";

export default class BlobTestServerFactory {
  public createServer(): BlobServer | SqlBlobServer {
    const databaseConnectionString = process.env.AZURITE_TEST_DB;
    const isSQL = databaseConnectionString !== undefined;

    const port = 11000;
    const host = "127.0.0.1";
    const persistenceArray: StoreDestinationArray = [
      {
        persistencyId: "test",
        persistencyPath: "__test_blob_extent__",
        maxConcurrency: 10
      }
    ];

    if (isSQL) {
      const sqlOptions = {
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

      const config = new SqlBlobConfiguration(
        host,
        port,
        databaseConnectionString!,
        sqlOptions,
        persistenceArray,
        false,
        undefined,
        false,
        undefined
      );

      return new SqlBlobServer(config);
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
        undefined
      );
      return new BlobServer(config);
    }
  }
}
