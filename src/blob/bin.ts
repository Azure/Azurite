import { configDebugLogger } from "../common/Logger";
import BlobConfiguration from "./BlobConfiguration";
import BlobServer from "./BlobServer";

/**
 * Entry for the blob service.
 *
 */
async function main() {
  const config = new BlobConfiguration();

  // Config debug logger singleton instance
  // TODO: better design for debugger log?
  configDebugLogger(config.enableDebugLog, config.debugLogFilePath);

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
