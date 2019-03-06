import Server from "../common/Server";
import BlobConfiguration from "./BlobConfiguration";
import BlobServer from "./BlobServer";

async function main() {
  const config = new BlobConfiguration();
  const server: Server = new BlobServer(config);
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
