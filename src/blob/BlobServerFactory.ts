import { join } from "path";

import { DEFAULT_SQL_OPTIONS } from "../common/utils/constants";
import BlobConfiguration from "./BlobConfiguration";
import BlobEnvironment from "./BlobEnvironment";
import BlobServer from "./BlobServer";
import IBlobEnvironment from "./IBlobEnvironment";
import SqlBlobConfiguration from "./SqlBlobConfiguration";
import SqlBlobServer from "./SqlBlobServer";
import { DEFAULT_BLOB_LISTENING_PORT, DEFAULT_BLOB_PERSISTENCE_PATH, DEFAULT_BLOB_SERVER_HOST_NAME } from "./utils/constants";
import {
  DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
  DEFAULT_BLOB_LOKI_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_ARRAY
} from "./utils/constants";
import { StoreDestinationArray } from "../common/persistence/IExtentStore";

export class BlobServerFactory {
  public async createServer(
    blobEnvironment?: IBlobEnvironment
  ): Promise<BlobServer | SqlBlobServer> {
    return this.createActualServer(
      blobEnvironment, 
      DEFAULT_BLOB_PERSISTENCE_ARRAY, 
      DEFAULT_BLOB_PERSISTENCE_PATH,
      "AZURITE_DB",
      DEFAULT_BLOB_SERVER_HOST_NAME,
      DEFAULT_BLOB_LISTENING_PORT,
      DEFAULT_BLOB_LOKI_DB_PATH,
      DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
      SqlBlobServer,
      BlobServer
    );
  }

  protected async createActualServer(
    blobEnvironment: IBlobEnvironment | undefined,
    persistenceArray: StoreDestinationArray,
    persistencePath: string,
    dbKey: string,
    defaultHost: string,
    defaultPort: number,
    defaultLokiDBPath: string,
    defaultExtentLokiDBPath: string,
    sqlSeverClass: any,
    blobServerClass: any,
  ): Promise<BlobServer | SqlBlobServer> {
    // TODO: Check it's in Visual Studio Code environment or not
    const isVSC = false;

    if (!isVSC) {
      const env = blobEnvironment ? blobEnvironment : new BlobEnvironment();
      const location = await env.location();
      const debugFilePath = await env.debug();

      if (typeof debugFilePath === "boolean") {
        throw RangeError(
          `Must provide a debug log file path for parameter -d or --debug`
        );
      }

      persistenceArray[0].locationPath = join(
        location,
        persistencePath
      );

      // TODO: Check we need to create blob server against SQL or Loki
      const databaseConnectionString = process.env[dbKey];
      const isSQL = databaseConnectionString !== undefined;

      if (isSQL) {
        const config = new SqlBlobConfiguration(
          env.blobHost() || defaultHost,
          env.blobPort() || defaultPort,
          databaseConnectionString!,
          DEFAULT_SQL_OPTIONS,
          persistenceArray,
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

        return new sqlSeverClass(config);
      } else {
        const config = new BlobConfiguration(
          env.blobHost() || defaultHost,
          env.blobPort() || defaultPort,
          join(location, defaultLokiDBPath),
          join(location, defaultExtentLokiDBPath),
          persistenceArray,
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
        return new blobServerClass(config);
      }
    } else {
      // TODO: Add BlobServer construction in VSC
      // Visual Studio Code Loki
      // Visual Studio Code SQL
      throw new Error("Not implemented.");
    }
  }
}
