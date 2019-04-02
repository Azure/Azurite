import * as Logger from "../common/Logger";
import BlobConfiguration from "./BlobConfiguration";
import BlobServer from "./BlobServer";

// tslint:disable:no-console

/**
 * Entry for Azurite blob service.
 */
async function main() {
  // Initialize configuration
  const config = new BlobConfiguration();

  // We use logger singleton as global debugger logger to track detailed outputs cross layers
  // Note that, debug log is different from access log which is only available in request handler layer to
  // track every request. Access log is not singleton, and initialized in specific RequestHandlerFactory implementations
  // Enable debug log by default before first release for debugging purpose
  Logger.configLogger(config.enableDebugLog || true, config.debugLogFilePath);

  // Create server instance
  const server = new BlobServer(config);

  // Start server
  console.log(
    `Azurite Blob service is starting on ${config.host}:${config.port}`
  );
  await server.start();
  console.log(
    `Azurite Blob service successfully listens on ${server.getHttpServerAddress()}`
  );

  // Handle close event
  const beforeCloseMessage = `Azurite Blob service is closing...`;
  const afterCloseMessage = `Azurite Blob service successfully closed`;
  process
    .on("message", msg => {
      if (msg === "shutdown") {
        console.log(beforeCloseMessage);
        server.close().then(() => {
          console.log(afterCloseMessage);
        });
      }
    })
    .on("SIGINT", () => {
      console.log(beforeCloseMessage);
      server.close().then(() => {
        console.log(afterCloseMessage);
      });
    });
}

main();
