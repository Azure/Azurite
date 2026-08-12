import { readdirSync, statSync, Dirent } from "fs";
import { join } from "path";

// All Loki metadata stores autosave on this interval (e.g.
// src/blob/persistence/LokiBlobMetadataStore.ts's `autosaveInterval: 5000`).
const LOKI_AUTOSAVE_INTERVAL_MS = 5000;

function latestMtimeMs(dirPath: string): number | undefined {
  let entries: Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return undefined; // Not created yet - keep polling.
  }

  let latest: number | undefined;
  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name);
    const mtime = entry.isDirectory()
      ? latestMtimeMs(entryPath)
      : safeMtimeMs(entryPath);
    if (mtime !== undefined && (latest === undefined || mtime > latest)) {
      latest = mtime;
    }
  }
  return latest;
}

function safeMtimeMs(filePath: string): number | undefined {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return undefined; // Removed/renamed mid-scan.
  }
}

/**
 * Polls every file under `dirPath` (recursively) until none of their mtimes
 * have advanced for `stableForMs`, which is as close as an external process
 * can get to observing that an async write (e.g. LokiJS's autosave/close
 * flush) has actually landed on disk. A closed HTTP port is not that signal:
 * ServerBase.close() calls `httpServer.stop()` (refusing new connections)
 * before `afterClose()` closes the metadata/extent stores, so a port-down
 * probe can resolve while the flush is still in flight - and the currently
 * published Marketplace VSIX may not even await its close command's promise
 * before returning.
 *
 * This deliberately doesn't take specific filenames to watch: a caller
 * hardcoding today's metadata/extent store filenames would silently stop
 * covering a future release that renames one (even with migration support
 * for the old name), breaking the version-agnostic guarantee this suite
 * exists for. Watching the whole directory tree's latest mtime is agnostic
 * to what gets renamed, added, or removed across versions.
 *
 * `stableForMs` must exceed the Loki autosave interval: otherwise the
 * directory can look quiet for the full window while sitting between two
 * periodic autosave ticks, with a pending write still due at the next tick.
 */
export async function waitForDirectoryStable(
  dirPath: string,
  timeoutMs = 30000,
  stableForMs = LOKI_AUTOSAVE_INTERVAL_MS + 1000,
  pollIntervalMs = 250
): Promise<void> {
  const start = Date.now();
  let lastMtimeMs: number | undefined;
  let stableSince: number | undefined;

  while (Date.now() - start < timeoutMs) {
    const mtimeMs = latestMtimeMs(dirPath);

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
    `${dirPath} did not stabilize within ${timeoutMs}ms` +
      (lastMtimeMs === undefined ? " (directory was never created)" : "")
  );
}
