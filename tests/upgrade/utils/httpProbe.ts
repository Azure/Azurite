import * as http from "http";

/** Distinguishes a real response, a timed-out request, and a refused connection. */
type ProbeResult = "up" | "timeout" | "down";

/**
 * Polls an HTTP endpoint until it responds (any HTTP response - including a
 * server-side error - counts as "up"). Shared by every harness (npm process,
 * Docker container, ...) that needs to wait for an Azurite listener to come
 * online, so readiness-polling logic lives in exactly one place.
 */
export async function waitForHttpUp(
  port: number,
  path = "/devstoreaccount1?comp=list",
  timeoutMs = 60000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await probeOnce(port, path)) === "up") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Port ${port} did not respond within ${timeoutMs}ms`);
}

/**
 * Polls an HTTP endpoint until it stops responding (connection refused).
 * NOTE: this is a liveness signal, not a persistence-completion one -
 * ServerBase.close() calls httpServer.stop() *before* afterClose() closes
 * the metadata/extent stores (src/common/ServerBase.ts), so the port can go
 * down while a LokiJS flush is still in flight. Callers that need to know
 * persistence actually landed on disk before proceeding (e.g. before a
 * separate process reads the same on-disk data) must additionally wait on
 * the metadata file itself - see fileStability.ts's waitForFileStable.
 *
 * A request timeout does NOT count as "down": it just means the listener
 * (or the event loop, mid-flush) hasn't answered within the probe's window,
 * not that the port was refused. Treating a timeout as "down" would let this
 * return while Azurite is still shutting down, racing the actual close.
 */
export async function waitForHttpDown(
  port: number,
  path = "/devstoreaccount1?comp=list",
  timeoutMs = 60000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await probeOnce(port, path)) === "down") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Port ${port} was still responding after ${timeoutMs}ms`);
}

function probeOnce(port: number, path: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path,
        timeout: 3000
      },
      (res) => {
        res.resume();
        resolve("up");
      }
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      // Only a refused connection proves the port is closed; other errors
      // (e.g. ECONNRESET while sockets are draining) are inconclusive.
      resolve(err.code === "ECONNREFUSED" ? "down" : "timeout");
    });
    req.on("timeout", () => {
      req.destroy();
      resolve("timeout");
    });
  });
}

