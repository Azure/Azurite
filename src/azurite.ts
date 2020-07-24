#!/usr/bin/env node
import { access } from "fs";
import { dirname, join } from "path";
import { promisify } from "util";

// Load Environment before BlobServerFactory to make sure args works properly
import Environment from "./common/Environment";
// tslint:disable-next-line:ordered-imports
import { BlobServerFactory } from "./blob/BlobServerFactory";

import * as Logger from "./common/Logger";
import QueueConfiguration from "./queue/QueueConfiguration";
import QueueServer from "./queue/QueueServer";
import {
  DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH,
  DEFAULT_QUEUE_LOKI_DB_PATH,
  DEFAULT_QUEUE_PERSISTENCE_ARRAY,
  DEFAULT_QUEUE_PERSISTENCE_PATH
} from "./queue/utils/constants";

import TableConfiguration from "./table/TableConfiguration";
import TableServer from "./table/TableServer";

import {
  DEFAULT_TABLE_LOKI_DB_PATH
} from "./table/utils/constants";

// tslint:disable:no-console

const accessAsync = promisify(access);

/**
 * Entry for Azurite services.
 */
async function main() {
  // Initialize and validate environment values from command line parameters
  const env = new Environment();

  const location = await env.location();
  await accessAsync(location);

  const debugFilePath = await env.debug();
  if (debugFilePath !== undefined) {
    await accessAsync(dirname(debugFilePath!));
  }

  const blobServerFactory = new BlobServerFactory();
  const blobServer = await blobServerFactory.createServer(env);
  const blobConfig = blobServer.config;

  // TODO: Align with blob DEFAULT_BLOB_PERSISTENCE_ARRAY
  // TODO: Join for all paths in the array
  DEFAULT_QUEUE_PERSISTENCE_ARRAY[0].locationPath = join(
    location,
    DEFAULT_QUEUE_PERSISTENCE_PATH
  );

  const queueConfig = new QueueConfiguration(
    env.queueHost(),
    env.queuePort(),
    join(location, DEFAULT_QUEUE_LOKI_DB_PATH),
    join(location, DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH),
    DEFAULT_QUEUE_PERSISTENCE_ARRAY,
    !env.silent(),
    undefined,
    env.debug() !== undefined,
    await env.debug(),
    env.loose(),
    env.skipApiVersionCheck(),
    env.cert(),
    env.key(),
    env.pwd(),
    env.oauth()
  );

  const tableConfig = new TableConfiguration(
    env.tableHost(),
    env.tablePort(),
    join(location, DEFAULT_TABLE_LOKI_DB_PATH),
    env.debug() !== undefined,
    !env.silent(),
    undefined,
    await env.debug(),
    env.loose(),
    env.skipApiVersionCheck(),
    env.cert(),
    env.key(),
    env.pwd(),
    env.oauth()
  );

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(blobConfig.enableDebugLog, blobConfig.debugLogFilePath);

  // Create queue server instance
  const queueServer = new QueueServer(queueConfig);

  // Create table server instance
  const tableServer = new TableServer(tableConfig);

  // Start server
  console.log(
    `Azurite Blob service is starting at ${blobConfig.getHttpServerAddress()}`
  );
  await blobServer.start();
  console.log(
    `Azurite Blob service is successfully listening at ${blobServer.getHttpServerAddress()}`
  );

  // Start server
  console.log(
    `Azurite Queue service is starting at ${queueConfig.getHttpServerAddress()}`
  );
  await queueServer.start();
  console.log(
    `Azurite Queue service is successfully listening at ${queueServer.getHttpServerAddress()}`
  );

  // Start server
  console.log(
    `Azurite Table service is starting at ${tableConfig.getHttpServerAddress()}`
  );
  await tableServer.start();
  console.log(
    `Azurite Table service is successfully listening at ${tableServer.getHttpServerAddress()}`
  );

  // Handle close event
  const blobBeforeCloseMessage = `Azurite Blob service is closing...`;
  const blobAfterCloseMessage = `Azurite Blob service successfully closed`;
  const tableBeforeCloseMessage = `Azurite Table service is closing...`;
  const tableAfterCloseMessage = `Azurite Table service successfully closed`;
  const queueBeforeCloseMessage = `Azurite Queue service is closing...`;
  const queueAfterCloseMessage = `Azurite Queue service successfully closed`;
  process
    .once("message", msg => {
      if (msg === "shutdown") {
        console.log(blobBeforeCloseMessage);
        blobServer.close().then(() => {
          console.log(blobAfterCloseMessage);
        });

        console.log(tableBeforeCloseMessage);
        tableServer.close().then(() => {
          console.log(tableAfterCloseMessage);
        });

        console.log(queueBeforeCloseMessage);
        queueServer.close().then(() => {
          console.log(queueAfterCloseMessage);
        });
      }
    })
    .once("SIGINT", () => {
      console.log(blobBeforeCloseMessage);
      blobServer.close().then(() => {
        console.log(blobAfterCloseMessage);
      });

      console.log(tableBeforeCloseMessage);
      tableServer.close().then(() => {
        console.log(tableAfterCloseMessage);
      });

      console.log(queueBeforeCloseMessage);
      queueServer.close().then(() => {
        console.log(queueAfterCloseMessage);
      });
    });
}

main().catch(err => {
  console.error(`Exit due to unhandled error: ${err.message}`);
  process.exit(1);
});
