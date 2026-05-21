#!/usr/bin/env node
import * as Logger from "../common/Logger";
import { BlobServerFactory } from "./BlobServerFactory";
import { setExtentMemoryLimit } from "../common/ConfigurationBase";
import BlobEnvironment from "./BlobEnvironment";
import { AzuriteTelemetryClient } from "../common/Telemetry";

// tslint:disable:no-console

function shutdown(server: { close: () => Promise<void> }) {
  const beforeCloseMessage = `Azurite Blob service is closing...`;
  const afterCloseMessage = `Azurite Blob service successfully closed`;
  AzuriteTelemetryClient.TraceStopEvent("Blob");

  console.log(beforeCloseMessage);
  server.close().then(() => {
    console.log(afterCloseMessage);
  });
}

/**
 * Entry for Azurite blob service.
 */
async function main() {
  const env = new BlobEnvironment();

  const blobServerFactory = new BlobServerFactory();
  const server = await blobServerFactory.createServer();
  const config = server.config;

  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  setExtentMemoryLimit(env, true);

  console.log(`Azurite Blob service is starting on ${config.host}:${config.port}`);
  await server.start();
  console.log(`Azurite Blob service successfully listens on ${server.getHttpServerAddress()}`);
  console.log(`Azurite DFS service is available on the same port as the Blob service.`);

  const location = await env.location();
  AzuriteTelemetryClient.init(location, !env.disableTelemetry(), env);
  await AzuriteTelemetryClient.TraceStartEvent("Blob");

  process
    .once("message", (msg) => {
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
