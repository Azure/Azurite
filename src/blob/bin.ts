import { configDebugLog } from "../common/Logger";
import BlobConfiguration from "./BlobConfiguration";
import BlobServer from "./BlobServer";

/**
 * Entry for the blob service.
 *
 */
async function main() {
  const config = new BlobConfiguration();

  // Config debug logger singleton instance
  configDebugLog(config.enableDebugLog, config.debugLogFilePath);

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
