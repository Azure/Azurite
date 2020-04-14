#!/usr/bin/env node
import { access } from "fs";
import { dirname, join } from "path";
import { promisify } from "util";

import * as Logger from "../common/Logger";
import QueueConfiguration from "./QueueConfiguration";
import QueueEnvironment from "./QueueEnvironment";
import QueueServer from "./QueueServer";
import {
  DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH,
  DEFAULT_QUEUE_LOKI_DB_PATH,
  DEFAULT_QUEUE_PERSISTENCE_ARRAY,
  DEFAULT_QUEUE_PERSISTENCE_PATH
} from "./utils/constants";

// tslint:disable:no-console

const accessAsync = promisify(access);

/**
 * Entry for Azurite queue service.
 */
async function main() {
  // Initialize and validate environment values from command line parameters
  const env = new QueueEnvironment();

  const location = await env.location();
  await accessAsync(location);

  const debugFilePath = await env.debug();
  if (debugFilePath !== undefined) {
    await accessAsync(dirname(debugFilePath!));
  }

  // Initialize server configuration
  // TODO: Should provide the absolute path directly.
  DEFAULT_QUEUE_PERSISTENCE_ARRAY[0].locationPath = join(
    location,
    DEFAULT_QUEUE_PERSISTENCE_PATH
  );
  const config = new QueueConfiguration(
    env.queueHost(),
    env.queuePort(),
    join(location, DEFAULT_QUEUE_LOKI_DB_PATH),
    join(location, DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH),
    DEFAULT_QUEUE_PERSISTENCE_ARRAY,
    !env.silent(),
    undefined,
    (await env.debug()) !== undefined,
    await env.debug(),
    env.loose(),
    env.cert(),
    env.key(),
    env.pwd()
  );

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  // Create server instance
  const server = new QueueServer(config);

  // Start server
  console.log(
    `Azurite Queue service is starting on ${config.host}:${config.port}`
  );
  await server.start();
  console.log(
    `Azurite Queue service successfully listens on ${server.getHttpServerAddress()}`
  );

  // Handle close event
  const beforeCloseMessage = `Azurite Queue service is closing...`;
  const afterCloseMessage = `Azurite Queue service successfully closed`;
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
