import BlobServer from "./BlobServer";

/**
 * Entry for the blob service.
 *
 */
async function main() {
  const server = new BlobServer();
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
