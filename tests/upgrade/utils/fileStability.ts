import { statSync } from "fs";

/**
 * Polls `filePath`'s mtime until it stops changing for `stableForMs`, which
 * is as close as an external process can get to observing that an async
 * write (e.g. LokiJS's autosave/close flush) has actually landed on disk.
 * A closed HTTP port is not that signal: ServerBase.close() calls
 * `httpServer.stop()` (refusing new connections) before `afterClose()`
 * closes the metadata/extent stores, so a port-down probe can resolve while
 * the flush is still in flight - and the currently published Marketplace
 * VSIX may not even await its close command's promise before returning.
 */
export async function waitForFileStable(
  filePath: string,
  timeoutMs = 30000,
  stableForMs = 1000,
  pollIntervalMs = 250
): Promise<void> {
  const start = Date.now();
  let lastMtimeMs: number | undefined;
  let stableSince: number | undefined;

  while (Date.now() - start < timeoutMs) {
    let mtimeMs: number | undefined;
    try {
      mtimeMs = statSync(filePath).mtimeMs;
    } catch {
      mtimeMs = undefined; // Not created yet - keep polling.
    }

    if (mtimeMs !== undefined) {
      if (mtimeMs !== lastMtimeMs) {
        lastMtimeMs = mtimeMs;
        stableSince = Date.now();
      } else if (
        stableSince !== undefined &&
        Date.now() - stableSince >= stableForMs
      ) {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `${filePath} did not stabilize within ${timeoutMs}ms` +
      (lastMtimeMs === undefined ? " (file was never created)" : "")
  );
}
