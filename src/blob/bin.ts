import Server from "../common/IServer";
import BlobServer from "./BlobServer";
import Configuration from "./Configuration";

async function main() {
  const config = new Configuration();
  const server: Server = new BlobServer(config);
  await server.start();

  process.on("message", (msg) => {
    if (msg === "shutdown") {
      server.close();
    }
  }).on("SIGINT", () => {
    server.close();
  });
}

main();
