import BlobConfiguration from "../src/blob/BlobConfiguration";
import BlobServer from "../src/blob/BlobServer";
import SqlBlobConfiguration from "../src/blob/SqlBlobConfiguration";
import SqlBlobServer from "../src/blob/SqlBlobServer";
import { StoreDestinationArray } from "../src/common/persistence/IExtentStore";
import { DEFAULT_SQL_OPTIONS } from "../src/common/utils/constants";
import { DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT } from "../src/blob/utils/constants";
import { IAccountModel } from "../src/common/AccountModel";
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
    accountModel?: IAccountModel
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
      if (
        accountModel !== undefined &&
        accountModel.accounts.some(
          (account) => account.blobService.isVersioningEnabled
        )
      ) {
        throw new Error(`Blob versioning is not supported when using SQL-based metadata.`)
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
      );

      return new SqlBlobServer(config);
    } else {
      // Blob versioning cannot be switched on or off against an existing workspace, so
      // suites that configure it need their own metadata DB.
      const suffix =
        accountModel !== undefined ? `_${accountModel.accounts.map((a) => `${a.name}-${a.blobService.isVersioningEnabled}`).join("_")}` : "";
      const lokiMetadataDBPath = `__test_db_blob${suffix}__.json`;
      const lokiExtentDBPath = `__test_db_blob_extent${suffix}__.json`;
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
        accountModel
      );
      return new BlobServer(config);
    }
  }
}
