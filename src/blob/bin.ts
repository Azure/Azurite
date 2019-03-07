import * as Logger from "../common/Logger";
import BlobConfiguration from "./BlobConfiguration";
import BlobServer from "./BlobServer";

/**
 * Entry for Azurite blob service.
 */
async function main() {
  const config = new BlobConfiguration();

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
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
