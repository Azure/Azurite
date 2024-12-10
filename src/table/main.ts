#!/usr/bin/env node
import { access, ensureDir } from "fs-extra";
import { dirname, join } from "path";

import * as Logger from "../common/Logger";
import TableConfiguration from "./TableConfiguration";
import TableEnvironment from "./TableEnvironment";
import TableServer from "./TableServer";
import { DEFAULT_TABLE_LOKI_DB_PATH } from "./utils/constants";
import { AzuriteTelemetryClient } from "../common/Telemetry";

// tslint:disable:no-console

/**
 * Entry for Azurite table service
 */
async function main() {
  // Initialize the environment from the command line parameters
  const env = new TableEnvironment();

  // Check access for process location
  const location = await env.location();
  await ensureDir(location);
  await access(location);

  // Check access for debug file path
  const debugFilePath = await env.debug();
  if (debugFilePath !== undefined) {
    await ensureDir(dirname(debugFilePath));
    await access(dirname(debugFilePath));
  }

  // Store table configuration
  const config = new TableConfiguration(
    env.tableHost(),
    env.tablePort(),
    env.tableKeepAliveTimeout(),
    join(location, DEFAULT_TABLE_LOKI_DB_PATH),
    (await env.debug()) !== undefined,
    !env.silent(),
    undefined,
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
  const server = new TableServer(config);

  const beforeStartMessage = `Azurite Table service is starting on ${config.host}:${config.port}`;
  const afterStartMessage = `Azurite Table service successfully started on ${config.host}:${config.port}`;
  const beforeCloseMessage = `Azurite Table service is closing...`;
  const afterCloseMessage = `Azurite Table service successfully closed`;

  // Start Server
  console.log(beforeStartMessage);
  await server.start();
  console.log(afterStartMessage);
  
  AzuriteTelemetryClient.init(location, !env.disableTelemetry(), env);
  await AzuriteTelemetryClient.TraceStartEvent("Table");

  // Handle close event
  process
    .once("message", (msg) => {
      if (msg === "shutdown") {
        console.log(beforeCloseMessage);
        AzuriteTelemetryClient.TraceStopEvent("Table");
        server.close().then(() => {
          console.log(afterCloseMessage);
        });
      }
    })
    .once("SIGINT", () => {
      console.log(beforeCloseMessage);
      AzuriteTelemetryClient.TraceStopEvent("Table");
      server.close().then(() => {
        console.log(afterCloseMessage);
      });
    });
}

main().catch((err) => {
  console.error(`Exiting due to an unhandled error: ${err.message}`);
  process.exit(1);
});
