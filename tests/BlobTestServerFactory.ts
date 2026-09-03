import BlobConfiguration from "../src/blob/BlobConfiguration";
import BlobServer from "../src/blob/BlobServer";
import SqlBlobConfiguration from "../src/blob/SqlBlobConfiguration";
import SqlBlobServer from "../src/blob/SqlBlobServer";
import { StoreDestinationArray } from "../src/common/persistence/IExtentStore";
import { DEFAULT_SQL_OPTIONS } from "../src/common/utils/constants";
import { DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT } from "../src/blob/utils/constants";
import { LIVE_TEST_MODE } from "./testutils";

/**
 * No-op stand-in returned in live mode. Tests call start/close/clean on the
 * "server", but in live mode there's no local server to manage - we just need
 * an object with a `config` whose host/port the test fixture can read.
 */
export class LiveModeStubServer {
  public readonly config = { host: "live.azure", port: 443 };
  public async start(): Promise<void> { /* no-op */ }
  public async close(): Promise<void> { /* no-op */ }
  public async clean(): Promise<void> { /* no-op */ }
}

export default class BlobTestServerFactory {
  public createServer(
    loose: boolean = false,
    skipApiVersionCheck: boolean = false,
    https: boolean = false,
    oauth?: string,
    enableHierarchicalNamespace: boolean = false
  ): BlobServer | SqlBlobServer | LiveModeStubServer {
    if (LIVE_TEST_MODE) {
      return new LiveModeStubServer();
    }
    const databaseConnectionString = process.env.AZURITE_TEST_DB;
    const isSQL = databaseConnectionString !== undefined;
    const inMemoryPersistence = process.env.AZURITE_TEST_INMEMORYPERSISTENCE !== undefined;

    const port = 11000;
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
      if (inMemoryPersistence) {
        throw new Error(`The in-memory persistence settings is not supported when using SQL-based metadata.`)
      }

      const config = new SqlBlobConfiguration(
        host,
        port,
        DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
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
        undefined,
        enableHierarchicalNamespace
      );

      return new SqlBlobServer(config);
    } else {
      const lokiMetadataDBPath = "__test_db_blob__.json";
      const lokiExtentDBPath = "__test_db_blob_extent__.json";
      const config = new BlobConfiguration(
        host,
        port,
        DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
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
        oauth,
        undefined,
        inMemoryPersistence,
        undefined,
        enableHierarchicalNamespace
      );
      return new BlobServer(config);
    }
  }
}
