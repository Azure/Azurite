import * as Logger from "../common/Logger";
import BlobConfiguration from "./BlobConfiguration";
import BlobServer from "./BlobServer";

/**
 * Entry for the blob service.
 *
 */
async function main() {
  const config = new BlobConfiguration();

  // We use logger singleton as global debugger logger to track details outputs cross layers
  Logger.configLogger(config.enableDebugLog, config.debugLogFilePath);

  const server = new BlobServer(config);
  await server.start();

  process
    .on("message", msg => {
      if (msg === "shutdown") {
        server.close();
      }
    })
    .on("SIGINT", () => {
      server.close();
    });
}

main();
