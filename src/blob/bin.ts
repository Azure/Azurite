import Configuration from "./Configuration";
import Server from "./Server";

async function main() {
  const config = new Configuration();
  const server = new Server(config);
  await server.init();
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
