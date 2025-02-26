#!/usr/bin/env node
import { access, ensureDir } from "fs-extra";
import { dirname, join } from "path";

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
import { setExtentMemoryLimit } from "../common/ConfigurationBase";
import { AzuriteTelemetryClient } from "../common/Telemetry";

// tslint:disable:no-console

function shutdown(server: QueueServer) {
  const beforeCloseMessage = `Azurite Queue service is closing...`;
  const afterCloseMessage = `Azurite Queue service successfully closed`;
  AzuriteTelemetryClient.TraceStopEvent("Queue");

  console.log(beforeCloseMessage);
  server.close().then(() => {
    console.log(afterCloseMessage);
  });
}

/**
 * Entry for Azurite queue service.
 */
async function main() {
  // Initialize and validate environment values from command line parameters
  const env = new QueueEnvironment();

  const location = await env.location();
  await ensureDir(location);
  await access(location);

  const debugFilePath = await env.debug();
  if (debugFilePath !== undefined) {
    await ensureDir(dirname(debugFilePath!));
    await access(dirname(debugFilePath!));
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
    env.queueKeepAliveTimeout(),
    join(location, DEFAULT_QUEUE_LOKI_DB_PATH),
    join(location, DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH),
    DEFAULT_QUEUE_PERSISTENCE_ARRAY,
    !env.silent(),
    undefined,
    (await env.debug()) !== undefined,
    await env.debug(),
    env.loose(),
    env.skipApiVersionCheck(),
    env.cert(),
    env.key(),
    env.pwd(),
    env.oauth(),
    env.disableProductStyleUrl(),
    env.inMemoryPersistence(),
  );

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  // Create server instance
  const server = new QueueServer(config);

  setExtentMemoryLimit(env, true);

  // Start server
  console.log(
    `Azurite Queue service is starting on ${config.host}:${config.port}`
  );
  await server.start();
  console.log(
    `Azurite Queue service successfully listens on ${server.getHttpServerAddress()}`
  );
  
  AzuriteTelemetryClient.init(location, !env.disableTelemetry(), env);
  await AzuriteTelemetryClient.TraceStartEvent("Queue");

  // Handle close event
  process
    .once("message", (msg: string) => {
      if (msg === "shutdown") {
        shutdown(server);
      }
    })
    .once("SIGINT", () => shutdown(server))
    .once("SIGTERM", () => shutdown(server));
}

main().catch((err) => {
  console.error(`Exit due to unhandled error: ${err.message}`);
  process.exit(1);
});
