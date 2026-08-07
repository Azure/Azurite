import * as http from "http";

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
    if (await probeOnce(port, path)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Port ${port} did not respond within ${timeoutMs}ms`);
}

function probeOnce(port: number, path: string): Promise<boolean> {
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
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
