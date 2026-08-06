import { join } from "path";

import { DEFAULT_SQL_OPTIONS } from "../common/utils/constants";
import logger from "../common/Logger";
import BlobConfiguration from "./BlobConfiguration";
import BlobEnvironment from "./BlobEnvironment";
import BlobServer from "./BlobServer";
import { resolveBlobEventCapturePath } from "./events/resolveBlobEventCapturePath";
import IBlobEnvironment from "./IBlobEnvironment";
import SqlBlobConfiguration from "./SqlBlobConfiguration";
import SqlBlobServer from "./SqlBlobServer";
import {
  DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
  DEFAULT_BLOB_LOKI_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_ARRAY,
  DEFAULT_BLOB_PERSISTENCE_PATH
} from "./utils/constants";

export class BlobServerFactory {
  public async createServer(
    blobEnvironment?: IBlobEnvironment
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

      const enableBlobEventCapture = env.blobEventCapture();
      const configuredCapturePath = env.blobEventCapturePath();
      const blobEventCapturePath = resolveBlobEventCapturePath(
        enableBlobEventCapture,
        configuredCapturePath,
        location
      );
      if (
        !enableBlobEventCapture &&
        configuredCapturePath &&
        configuredCapturePath.length > 0
      ) {
        // Note the empty-string check: the VS Code setting declares a "" default,
        // so get<string>() returns "" (not undefined) when unset. Warn only when
        // a non-empty path was actually supplied without enabling capture.
        logger.warn(
          "blobEventCapturePath is configured but blobEventCapture is disabled; blob event capture is OFF and the path will be ignored."
        );
      }

      DEFAULT_BLOB_PERSISTENCE_ARRAY[0].locationPath = join(
        location,
        DEFAULT_BLOB_PERSISTENCE_PATH
      );

      // TODO: Check we need to create blob server against SQL or Loki
      const databaseConnectionString = process.env.AZURITE_DB;
      const isSQL = databaseConnectionString !== undefined;

      if (isSQL) {
        if (env.inMemoryPersistence()) {
          throw new Error(`The --inMemoryPersistence option is not supported when using SQL-based metadata storage.`)
        }
        if (env.extentMemoryLimit() !== undefined) {
          throw new Error(`The --extentMemoryLimit option is not supported when using SQL-based metadata storage.`)
        }

        const config = new SqlBlobConfiguration(
          env.blobHost(),
          env.blobPort(),
          env.blobKeepAliveTimeout(),
          databaseConnectionString!,
          DEFAULT_SQL_OPTIONS,
          DEFAULT_BLOB_PERSISTENCE_ARRAY,
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
          env.disableProductStyleUrl(),
          enableBlobEventCapture,
          blobEventCapturePath
        );

        return new SqlBlobServer(config);
      } else {
        const config = new BlobConfiguration(
          env.blobHost(),
          env.blobPort(),
          env.blobKeepAliveTimeout(),
          join(location, DEFAULT_BLOB_LOKI_DB_PATH),
          join(location, DEFAULT_BLOB_EXTENT_LOKI_DB_PATH),
          DEFAULT_BLOB_PERSISTENCE_ARRAY,
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
          env.disableProductStyleUrl(),
          env.inMemoryPersistence(),
          undefined,
          enableBlobEventCapture,
          blobEventCapturePath
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
