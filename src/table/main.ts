/**
 * This file is used to start table service alone.
 */

import { access } from "fs";
import { dirname, join } from "path";
import { promisify } from "util";

import * as Logger from "../common/Logger";
import TableConfiguration from "./TableConfiguration";
import TableEnvironment from "./TableEnvironment";

import {
  DEFAULT_TABLE_EXTENT_LOKI_DB_PATH,
  DEFAULT_TABLE_LOKI_DB_PATH,
  DEFAULT_TABLE_PERSISTENCE_ARRAY,
  DEFAULT_TABLE_PERSISTENCE_PATH
} from "./utils/constants";

import TableServer from "./TableServer";

/**
 * Entry for Azurite table service
 */
async function main() {
  // Initialize the environment from the command line parameters
  const env = new TableEnvironment();

  // Check access for process location
  const accessAsync = promisify(access);
  const location = await env.location();
  await accessAsync(location);

  // Check access for debug file path
  const debugFilePath = await env.debug();
  if (debugFilePath !== undefined) {
    await accessAsync(dirname(debugFilePath));
  }

  // Modify the table path
  DEFAULT_TABLE_PERSISTENCE_ARRAY[0].locationPath = join(
    location,
    DEFAULT_TABLE_PERSISTENCE_PATH
  );

  // Store table configuation
  const config = new TableConfiguration(
    env.tableHost(),
    env.tablePort(),
    join(location, DEFAULT_TABLE_LOKI_DB_PATH),
    join(location, DEFAULT_TABLE_EXTENT_LOKI_DB_PATH),
    DEFAULT_TABLE_PERSISTENCE_ARRAY,
    !env.silent(),
    undefined,
    (await env.debug()) !== undefined,
    await env.debug(),
    env.loose(),
    env.skipApiVersionCheck()
  );

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  // Create server instance
  const server = new TableServer(config);

  const beforeStartMessage = `Azurite Table service is starting on ${config.host}:${config.port}`;
  const afterStartMessage = `Azurite Table service successfully started on ${config.host}:${config.port}`;
  const beforeCloseMessage = `Azurite Table service is closing...`;
  const afterCloseMessage = `Azurite Table service successfully closed`;

  // Start Server
  console.log(beforeStartMessage);
  server.start();
  console.log(afterStartMessage);

  // Handle close event
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
      server.clean().then(() => {
        console.log(afterCloseMessage);
      });
    });
}

main().catch(err => {
  console.error(`Exit die to unhandled error: ${err.message}`);
  process.exit(1);
});
