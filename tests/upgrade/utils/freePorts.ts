import { AddressInfo, createServer } from "net";

/**
 * Binds `count` ephemeral servers to port 0 simultaneously and returns the
 * ports the OS assigned, only releasing them once all are held - so the OS
 * can't hand back an already-selected port for a later allocation, which
 * would configure two Azurite services on one port. Used so VSIX test
 * sessions never collide with a developer's own already-running Azurite
 * instance on the well-known default ports (10000/10001/10002).
 */
export function getFreePorts(count: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const servers = Array.from({ length: count }, () => createServer());
    let pending = servers.length;
    servers.forEach((server) => {
      server.unref();
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        if (--pending === 0) {
          const ports = servers.map((s) => (s.address() as AddressInfo).port);
          let closed = 0;
          servers.forEach((s) =>
            s.close(() => {
              if (++closed === servers.length) {
                resolve(ports);
              }
            })
          );
        }
      });
    });
  });
}
