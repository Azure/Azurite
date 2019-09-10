#!/usr/bin/env node

import { access } from "fs";
import { dirname, join } from "path";
import { promisify } from "util";

import BlobConfiguration, {
  DEFUALT_BLOB_PERSISTENCE_ARRAY
} from "./blob/BlobConfiguration";
import BlobServer from "./blob/BlobServer";
import {
  DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
  DEFAULT_BLOB_LOKI_DB_PATH
} from "./blob/utils/constants";
import Environment from "./common/Environment";
import * as Logger from "./common/Logger";
import { StoreDestinationArray } from "./common/persistence/IExtentStore";
import QueueConfiguration from "./queue/QueueConfiguration";
import QueueServer from "./queue/QueueServer";
import {
  DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH,
  DEFAULT_QUEUE_LOKI_DB_PATH,
  DEFAULT_QUEUE_PERSISTENCE_PATH
} from "./queue/utils/constants";

const DEFUALT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
  {
    persistencyId: "Default",
    persistencyPath: DEFAULT_QUEUE_PERSISTENCE_PATH,
    maxConcurrency: 1
  }
];
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

  // Initialize server configuration
  const blobConfig = new BlobConfiguration(
    env.blobHost(),
    env.blobPort(),
    join(location, DEFAULT_BLOB_LOKI_DB_PATH),
    join(location, DEFAULT_BLOB_EXTENT_LOKI_DB_PATH),
    DEFUALT_BLOB_PERSISTENCE_ARRAY,
    !env.silent(),
    undefined,
    env.debug() !== undefined,
    env.debug()
  );

  DEFUALT_QUEUE_PERSISTENCE_ARRAY[0].persistencyPath = join(
    location,
    DEFAULT_QUEUE_PERSISTENCE_PATH
  );
  const queueConfig = new QueueConfiguration(
    env.queueHost(),
    env.queuePort(),
    join(location, DEFAULT_QUEUE_LOKI_DB_PATH),
    join(location, DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH),
    DEFUALT_QUEUE_PERSISTENCE_ARRAY,
    !env.silent(),
    undefined,
    env.debug() !== undefined,
    env.debug()
  );

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(blobConfig.enableDebugLog, blobConfig.debugLogFilePath);

  // Create server instance
  const blobServer = new BlobServer(blobConfig);
  const queueServer = new QueueServer(queueConfig);

  // Start server
  console.log(
    `Azurite Blob service is starting on ${blobConfig.host}:${blobConfig.port}`
  );
  await blobServer.start();
  console.log(
    `Azurite Blob service successfully listens on ${blobServer.getHttpServerAddress()}`
  );

  // Start server
  console.log(
    `Azurite Queue service is starting on ${queueConfig.host}:${
      queueConfig.port
    }`
  );
  await queueServer.start();
  console.log(
    `Azurite Queue service successfully listens on ${queueServer.getHttpServerAddress()}`
  );

  // Handle close event
  const blobBeforeCloseMessage = `Azurite Blob service is closing...`;
  const blobAfterCloseMessage = `Azurite Blob service successfully closed`;

  const queueBeforeCloseMessage = `Azurite Blob service is closing...`;
  const queueAfterCloseMessage = `Azurite Blob service successfully closed`;
  process
    .once("message", msg => {
      if (msg === "shutdown") {
        console.log(blobBeforeCloseMessage);
        blobServer.close().then(() => {
          console.log(blobAfterCloseMessage);
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
