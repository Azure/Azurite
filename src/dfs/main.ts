#!/usr/bin/env node
import * as Logger from "../common/Logger";
import DataLakeServer from "./DataLakeServer";
import { DataLakeServerFactory } from "./DataLakeServerFactory";
import SqlDataLakeServer from "./SqlDataLakeServer";

// tslint:disable:no-console

function shutdown(server: DataLakeServer | SqlDataLakeServer) {
  const beforeCloseMessage = `Azurite DataLake service is closing...`;
  const afterCloseMessage = `Azurite DataLake service successfully closed`;

  console.log(beforeCloseMessage);
  server.close().then(() => {
    console.log(afterCloseMessage);
  });
}

/**
 * Entry for Azurite DataLake service.
 */
async function main() {
  const blobServerFactory = new DataLakeServerFactory();
  const server = await blobServerFactory.createServer();
  const config = server.config;

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  // Start server
  console.log(
    `Azurite DataLake service is starting on ${config.host}:${config.port}`
  );
  await server.start();
  console.log(
    `Azurite DataLake service successfully listens on ${server.getHttpServerAddress()}`
  );

  // Handle close event
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
