import { join } from "path";

import { DEFAULT_SQL_OPTIONS } from "../common/utils/constants";
import BlobConfiguration from "./BlobConfiguration";
import BlobEnvironment from "./BlobEnvironment";
import BlobServer from "./BlobServer";
import SqlBlobConfiguration from "./SqlBlobConfiguration";
import SqlBlobServer from "./SqlBlobServer";
import { DEFAULT_BLOB_PERSISTENCE_PATH } from "./utils/constants";
import {
  DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
  DEFAULT_BLOB_LOKI_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_ARRAY
} from "./utils/constants";

export class BlobServerFactory {
  public async createServer(): Promise<BlobServer | SqlBlobServer> {
    // TODO: Check it's in Visual Studio Code environment or not
    const isVSC = false;

    if (!isVSC) {
      const env = new BlobEnvironment();
      const location = await env.location();
      const debugFilePath = await env.debug();

      DEFAULT_BLOB_PERSISTENCE_ARRAY[0].persistencyPath = join(
        location,
        DEFAULT_BLOB_PERSISTENCE_PATH
      );

      // TODO: Check we need to create blob server against SQL or Loki
      const databaseConnectionString = process.env.AZURITE_DB;
      const isSQL = databaseConnectionString !== undefined;

      if (isSQL) {
        const config = new SqlBlobConfiguration(
          env.blobHost(),
          env.blobPort(),
          databaseConnectionString!,
          DEFAULT_SQL_OPTIONS,
          DEFAULT_BLOB_PERSISTENCE_ARRAY,
          !env.silent(),
          undefined,
          debugFilePath !== undefined,
          debugFilePath
        );

        return new SqlBlobServer(config);
      } else {
        const config = new BlobConfiguration(
          env.blobHost(),
          env.blobPort(),
          join(location, DEFAULT_BLOB_LOKI_DB_PATH),
          join(location, DEFAULT_BLOB_EXTENT_LOKI_DB_PATH),
          DEFAULT_BLOB_PERSISTENCE_ARRAY,
          !env.silent(),
          undefined,
          debugFilePath !== undefined,
          debugFilePath
        );
        return new BlobServer(config);
      }
    } else {
      // TODO: Add BlobServer construction in VSC
      // Visual Studio Code Loki
      // Visual Studio Code SQL
      throw new Error("Not implemented.");
    }
  }
}
