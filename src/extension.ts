import { access } from "fs";
import { join } from "path";
import rimraf from "rimraf";
import { promisify } from "util";
import {
  commands,
  ExtensionContext,
  Progress,
  ProgressLocation,
  window
} from "vscode";

import BlobConfiguration from "./blob/BlobConfiguration";
import BlobServer from "./blob/BlobServer";
import {
  DEFAULT_BLOB_PERSISTENCE_PATH,
  DEFAULT_LOKI_DB_PATH
} from "./blob/utils/constants";
import * as Logger from "./common/Logger";
import NoLoggerStrategy from "./common/NoLoggerStrategy";
import ServerBase, { ServerStatus } from "./common/ServerBase";
import VSCChannelLoggerStrategy from "./common/VSCChannelLoggerStrategy";
import { VSCChannelWriteStream } from "./common/VSCChannelWriteStream";
import VSCEnvironment from "./common/VSCEnvironment";

// tslint:disable: no-console

const accessAsync = promisify(access);

let blobServer: ServerBase;
const accessLoggerStream = new VSCChannelWriteStream("Azurite");
const debugLoggerStrategy = new VSCChannelLoggerStrategy("Azurite Debug");

async function getBlobConfiguration(): Promise<BlobConfiguration> {
  const env = new VSCEnvironment();
  const location = await env.location();
  console.log(`Location: ${location}`);
  await accessAsync(location);

  // Initialize server configuration
  const config = new BlobConfiguration(
    env.blobHost(),
    env.blobPort(),
    join(location, DEFAULT_LOKI_DB_PATH),
    join(location, DEFAULT_BLOB_PERSISTENCE_PATH),
    !env.silent(),
    accessLoggerStream,
    env.debug() === true,
    undefined
  );
  console.log(config);
  return config;
}

async function startAzuriteBlob(
  progress: Progress<{ message?: string; increment?: number }>
) {
  if (
    blobServer !== undefined &&
    blobServer.getStatus() !== ServerStatus.Closed
  ) {
    throw Error(
      `Please close existing Azurite Blob Service before starting a new instance`
    );
  }

  const config = await getBlobConfiguration();
  Logger.default.strategy = config.enableDebugLog
    ? debugLoggerStrategy
    : new NoLoggerStrategy();

  // Create server instance
  blobServer = new BlobServer(config);

  // Start server
  progress.report({
    increment: 30,
    message: `Azurite Blob Service is starting on ${config.host}:${config.port}`
  });
  console.log(
    `Azurite Blob Service is starting on ${config.host}:${config.port}`
  );
  accessLoggerStream.write(
    `Azurite Blob Service is starting on ${config.host}:${config.port}\n`
  );

  await blobServer.start();

  progress.report({
    increment: 100,
    message: `Azurite Blob Service successfully listens on ${blobServer.getHttpServerAddress()}`
  });
  console.log(
    `Azurite Blob Service successfully listens on ${blobServer.getHttpServerAddress()}`
  );
  accessLoggerStream.write(
    `Azurite Blob Service successfully listens on ${blobServer.getHttpServerAddress()}\n`
  );
  window.showInformationMessage(
    `Azurite Blob Service successfully listens on ${blobServer.getHttpServerAddress()}`
  );
}

async function closeAzuriteBlob(
  progress: Progress<{ message?: string; increment?: number }>
) {
  if (
    blobServer === undefined ||
    blobServer.getStatus() !== ServerStatus.Running
  ) {
    throw Error(
      `Cannot close Azurite Blob Service because no existing running Azurite Blob Service instance`
    );
  }

  console.log(`Azurite Blob Service is closing...`);
  accessLoggerStream.write(`Azurite Blob Service is closing...\n`);
  progress.report({
    increment: 30,
    message: `Azurite Blob Service is closing...`
  });
  await blobServer.close();
  console.log(`Azurite Blob Service successfully closed`);
  accessLoggerStream.write(`Azurite Blob Service successfully closed\n`);
  progress.report({
    increment: 100,
    message: `Azurite Blob Service successfully closed`
  });
  window.showInformationMessage(`Azurite Blob Service successfully closed`);
}

async function cleanAzuriteBlob(
  progress: Progress<{ message?: string; increment?: number }>
) {
  if (
    blobServer !== undefined &&
    blobServer.getStatus() !== ServerStatus.Closed
  ) {
    throw Error(
      `Cannot clean Azurite Blob Service because it's not closed yet`
    );
  }

  const config = await getBlobConfiguration();

  progress.report({
    increment: 30,
    message: `Cleaning Azurite Blob Service...`
  });
  accessLoggerStream.write(`Cleaning Azurite Blob Service...\n`);

  const rimrafAsync = promisify(rimraf);
  await rimrafAsync(config.dbPath);
  await rimrafAsync(config.persistencePath);

  progress.report({
    increment: 100,
    message: `Clean up Azurite Blob Service successfully`
  });
  window.showInformationMessage(`Clean up Azurite Blob Service successfully`);
  accessLoggerStream.write(`Clean up Azurite Blob Service successfully\n`);
}

export function activate(context: ExtensionContext) {
  console.log("Azurite extension is now active!");

  context.subscriptions.push(
    commands.registerCommand("azurite.start", () => {
      window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Starting Azurite..."
        },
        progress => {
          return startAzuriteBlob(progress).catch(err => {
            window.showErrorMessage(
              `Start Azurite Blob Service error: ${err.message}`
            );
          });
        }
      );
    }),
    commands.registerCommand("azurite.close", () => {
      window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Closing Azurite..."
        },
        progress => {
          return closeAzuriteBlob(progress).catch(err => {
            window.showErrorMessage(
              `Close Azurite Blob Service error: ${err.message}`
            );
          });
        }
      );
    }),
    commands.registerCommand("azurite.clean", () => {
      window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Cleaning Azurite..."
        },
        progress => {
          return cleanAzuriteBlob(progress).catch(err => {
            window.showErrorMessage(
              `Clean Azurite Blob Service error: ${err.message}`
            );
          });
        }
      );
    }),
    commands.registerCommand("azurite.start_blob", () => {
      window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Starting Azurite Blob Service..."
        },
        progress => {
          return startAzuriteBlob(progress).catch(err => {
            window.showErrorMessage(
              `Start Azurite Blob Service error: ${err.message}`
            );
          });
        }
      );
    }),
    commands.registerCommand("azurite.close_blob", () => {
      window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Closing Azurite Blob Service..."
        },
        progress => {
          return closeAzuriteBlob(progress).catch(err => {
            window.showErrorMessage(
              `Close Azurite Blob Service error: ${err.message}`
            );
          });
        }
      );
    }),
    commands.registerCommand("azurite.clean_blob", () => {
      window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Cleaning Azurite Blob Service..."
        },
        progress => {
          return cleanAzuriteBlob(progress).catch(err => {
            window.showErrorMessage(
              `Clean Azurite Blob Service error: ${err.message}`
            );
          });
        }
      );
    })
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
