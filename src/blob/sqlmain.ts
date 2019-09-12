#!/usr/bin/env node
import { access } from "fs";
import { dirname } from "path";
import { promisify } from "util";

import Environment from "../common/Environment";
import * as Logger from "../common/Logger";
import SqlBlobConfiguration, {
  DEFUALT_BLOB_PERSISTENCE_ARRAY
} from "./SqlBlobConfiguration";
import SqlBlobServer from "./SqlBlobServer";
import { DEFAULT_BLOB_LOKI_DB_PATH } from "./utils/constants";

// tslint:disable:no-console

const accessAsync = promisify(access);

/**
 * Entry for Azurite blob service.
 */
async function main() {
  // Initialize and validate environment values from command line parameters
  const env = new Environment();
  const location = await env.location();
  await accessAsync(location);
  if (env.debug() !== undefined) {
    await accessAsync(dirname(env.debug()!));
  }

  const DEFUALT_SQL_URI =
    "mariadb://root:my-secret-pw@127.0.0.1:3306/azurite_blob_metadata";
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

  const config = new SqlBlobConfiguration(
    env.blobHost(),
    env.blobPort(),
    DEFUALT_SQL_URI,
    DEFUALT_SQL_OPTIONS,
    DEFAULT_BLOB_LOKI_DB_PATH,
    DEFUALT_BLOB_PERSISTENCE_ARRAY,
    !env.silent(),
    undefined,
    env.debug() !== undefined,
    env.debug()
  );

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  // Create server instance
  const server = new SqlBlobServer(config);

  // Start server
  console.log(
    `Azurite Blob service is starting on ${config.host}:${config.port}`
  );
  await server.start();
  console.log(
    `Azurite Blob service successfully listens on ${server.getHttpServerAddress()}`
  );

  // Handle close event
  const beforeCloseMessage = `Azurite Blob service is closing...`;
  const afterCloseMessage = `Azurite Blob service successfully closed`;
  process
    .once("message", msg => {
      if (msg === "shutdown") {
        console.log(beforeCloseMessage);
        server.close().then(() => {
          console.log(afterCloseMessage);
        });
      }
    })
    .once("SIGINT", () => {
      console.log(beforeCloseMessage);
      server.close().then(() => {
        console.log(afterCloseMessage);
      });
    });
}

main().catch(err => {
  console.error(`Exit due to unhandled error: ${err.message}`);
  process.exit(1);
});
