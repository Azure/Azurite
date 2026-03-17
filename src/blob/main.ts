#!/usr/bin/env node
import * as Logger from "../common/Logger";
import { BlobServerFactory } from "./BlobServerFactory";
import SqlBlobServer from "./SqlBlobServer";
import BlobServer from "./BlobServer";
import { setExtentMemoryLimit } from "../common/ConfigurationBase";
import BlobEnvironment from "./BlobEnvironment";
import { AzuriteTelemetryClient } from "../common/Telemetry";
import DfsConfiguration from "./DfsConfiguration";
import DfsServer from "./DfsServer";

// tslint:disable:no-console

function shutdown(server: BlobServer | SqlBlobServer, dfsServer: DfsServer) {
  const beforeCloseMessage = `Azurite Blob service is closing...`;
  const afterCloseMessage = `Azurite Blob service successfully closed`;
  const dfsBeforeCloseMessage = `Azurite DFS service is closing...`;
  const dfsAfterCloseMessage = `Azurite DFS service successfully closed`;
  AzuriteTelemetryClient.TraceStopEvent("Blob");

  console.log(beforeCloseMessage);
  server.close().then(() => {
    console.log(afterCloseMessage);
  });

  console.log(dfsBeforeCloseMessage);
  dfsServer.close().then(() => {
    console.log(dfsAfterCloseMessage);
  });
}

/**
 * Entry for Azurite blob service.
 */
async function main() {
  const blobServerFactory = new BlobServerFactory();
  const server = await blobServerFactory.createServer();
  const config = server.config;
  const env = new BlobEnvironment();
  const dfsConfig = new DfsConfiguration(
    env.dfsHost(),
    env.dfsPort(),
    env.blobKeepAliveTimeout(),
    env.cert(),
    env.key(),
    env.pwd()
  );
  const dfsServer = new DfsServer(
    dfsConfig,
    (server as BlobServer).metadataStore,
    (server as BlobServer).extentStore,
    (server as BlobServer).accountDataStore
  );

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  setExtentMemoryLimit(env, true);

  // Start server
  console.log(
    `Azurite Blob service is starting on ${config.host}:${config.port}`
  );
  await server.start();
  console.log(
    `Azurite Blob service successfully listens on ${server.getHttpServerAddress()}`
  );

  console.log(
    `Azurite DFS service is starting on ${dfsConfig.host}:${dfsConfig.port}`
  );
  await dfsServer.start();
  console.log(
    `Azurite DFS service successfully listens on ${dfsServer.getHttpServerAddress()}`
  );

  const location = await env.location();
  AzuriteTelemetryClient.init(location, !env.disableTelemetry(), env);
  await AzuriteTelemetryClient.TraceStartEvent("Blob");

  // Handle close event
  process
    .once("message", (msg) => {
      if (msg === "shutdown") {
        shutdown(server, dfsServer);
      }
    })
    .once("SIGINT", () => shutdown(server, dfsServer))
    .once("SIGTERM", () => shutdown(server, dfsServer));
}

main().catch((err) => {
  console.error(`Exit due to unhandled error: ${err.message}`);
  process.exit(1);
});
