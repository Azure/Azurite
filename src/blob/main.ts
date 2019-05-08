import { access } from "fs";
import { dirname, join } from "path";
import { promisify } from "util";

import Environment from "../common/Environment";
import * as Logger from "../common/Logger";
import BlobConfiguration from "./BlobConfiguration";
import BlobServer from "./BlobServer";
import {
  DEFAULT_BLOB_PERSISTENCE_PATH,
  DEFAULT_LOKI_DB_PATH
} from "./utils/constants";

// tslint:disable:no-console

const accessAsync = promisify(access);

/**
 * Entry for Azurite blob service.
 */
async function main() {
  // Initialize and validate environment values from command line parameters
  const env = new Environment();
  await accessAsync(env.location);
  if (env.debug !== undefined) {
    await accessAsync(dirname(env.debug));
  }

  // Initialize server configuration
  const config = new BlobConfiguration(
    env.blobHost,
    env.blobPort,
    join(env.location, DEFAULT_LOKI_DB_PATH),
    join(env.location, DEFAULT_BLOB_PERSISTENCE_PATH),
    !env.silent,
    undefined,
    env.debug !== undefined,
    env.debug
  );

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  // Create server instance
  const server = new BlobServer(config);

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
    .on("message", msg => {
      if (msg === "shutdown") {
        console.log(beforeCloseMessage);
        server.close().then(() => {
          console.log(afterCloseMessage);
        });
      }
    })
    .on("SIGINT", () => {
      console.log(beforeCloseMessage);
      server.close().then(() => {
        console.log(afterCloseMessage);
      });
    });
}

main().catch(err => {
  console.error(err.message);
  process.exit();
});
