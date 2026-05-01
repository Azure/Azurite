#!/usr/bin/env node
import { access, ensureDir } from "fs-extra";
import { dirname, join } from "path";

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
import SqlBlobServer from "./blob/SqlBlobServer";
import BlobServer from "./blob/BlobServer";

import TableConfiguration from "./table/TableConfiguration";
import TableServer from "./table/TableServer";

import { DEFAULT_TABLE_LOKI_DB_PATH } from "./table/utils/constants";
import { setExtentMemoryLimit } from "./common/ConfigurationBase";
import { AzuriteTelemetryClient } from "./common/Telemetry";

// tslint:disable:no-console

function shutdown(
  blobServer: BlobServer | SqlBlobServer,
  queueServer: QueueServer,
  tableServer: TableServer
) {
  AzuriteTelemetryClient.TraceStopEvent();

  console.log(`Azurite Blob service is closing...`);
  blobServer.close().then(() => console.log(`Azurite Blob service successfully closed`));

  console.log(`Azurite Queue service is closing...`);
  queueServer.close().then(() => console.log(`Azurite Queue service successfully closed`));

  console.log(`Azurite Table service is closing...`);
  tableServer.close().then(() => console.log(`Azurite Table service successfully closed`));
}

/**
 * Entry for Azurite services.
 */
async function main() {

  // Initialize and validate environment values from command line parameters
  const env = new Environment();

  const location = await env.location();
  await ensureDir(location);
  await access(location);

  const debugFilePath = await env.debug();
  if (debugFilePath !== undefined) {
    await ensureDir(dirname(debugFilePath!));
    await access(dirname(debugFilePath!));
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
    env.queueKeepAliveTimeout(),
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
    env.oauth(),
    env.disableProductStyleUrl(),
    env.inMemoryPersistence(),
  );

  const tableConfig = new TableConfiguration(
    env.tableHost(),
    env.tablePort(),
    env.tableKeepAliveTimeout(),
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
    env.oauth(),
    env.disableProductStyleUrl(),
    env.inMemoryPersistence(),
  );

  Logger.configLogger(blobConfig.enableDebugLog, blobConfig.debugLogFilePath);

  const queueServer = new QueueServer(queueConfig);
  const tableServer = new TableServer(tableConfig);

  setExtentMemoryLimit(env, true);

  console.log(`Azurite Blob service is starting at ${blobConfig.getHttpServerAddress()}`);
  await blobServer.start();
  console.log(`Azurite Blob service is successfully listening at ${blobServer.getHttpServerAddress()}`);
  console.log(`Azurite DFS service is available on the same port as the Blob service.`);

  console.log(`Azurite Queue service is starting at ${queueConfig.getHttpServerAddress()}`);
  await queueServer.start();
  console.log(`Azurite Queue service is successfully listening at ${queueServer.getHttpServerAddress()}`);

  console.log(`Azurite Table service is starting at ${tableConfig.getHttpServerAddress()}`);
  await tableServer.start();
  console.log(`Azurite Table service is successfully listening at ${tableServer.getHttpServerAddress()}`);

  AzuriteTelemetryClient.init(location, !env.disableTelemetry(), env);
  await AzuriteTelemetryClient.TraceStartEvent();

  process
    .once("message", (msg) => {
      if (msg === "shutdown") {
        shutdown(blobServer, queueServer, tableServer);
      }
    })
    .once("SIGINT", () => shutdown(blobServer, queueServer, tableServer))
    .once("SIGTERM", () => shutdown(blobServer, queueServer, tableServer));
}

main().catch((err) => {
  console.error(`Exit due to unhandled error: ${err.message}`);
  process.exit(1);
});
