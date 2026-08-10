// Cross-platform replacement for the `rimraf` CLI, used by the npm `clean`
// and `clean:deep` scripts. It removes the fixed set of build/test output
// paths below plus any files matching a small set of glob patterns, using
// only Node.js built-ins (no external dependency required).
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

/**
 * Recursively removes a file or directory, mirroring `rimraf`'s behavior.
 * Missing targets (ENOENT) are silently ignored; any other error is logged
 * as a warning rather than thrown, so a single failure doesn't abort the
 * rest of the cleanup.
 *
 * @param {string} target Absolute path to the file or directory to remove.
 */
function rm(target) {
  try {
    fs.rmSync(target, {
      recursive: true,
      force: true,
      // Windows can transiently lock files (e.g. antivirus scans, file
      // handles not yet released), so retry a few times there. POSIX
      // platforms don't need retries.
      maxRetries: process.platform === "win32" ? 10 : 0
    });
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Warning: could not remove ${target}: ${err.message}`);
    }
  }
}

/**
 * Removes every file directly under `rootDir` whose name ends with the
 * extension from a simple `*.ext` glob pattern (e.g. `*.log`).
 *
 * @param {string} pattern A glob pattern of the form `*.ext`.
 */
function rmGlob(pattern) {
  const match = pattern.match(/^\*(\..+)$/);
  if (!match) {
    throw new Error(`Unsupported glob pattern: ${pattern}`);
  }
  const ext = match[1];
  let entries;
  try {
    entries = fs.readdirSync(rootDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.endsWith(ext)) {
      rm(path.join(rootDir, entry));
    }
  }
}

/**
 * Removes every file/directory directly under `rootDir` whose name starts
 * with the prefix from a simple `prefix*` glob pattern (e.g. `__*`).
 *
 * @param {string} pattern A glob pattern of the form `prefix*`.
 */
function rmPrefix(pattern) {
  const match = pattern.match(/^(.+)\*$/);
  if (!match) {
    throw new Error(`Unsupported prefix pattern: ${pattern}`);
  }
  const prefix = match[1];
  let entries;
  try {
    entries = fs.readdirSync(rootDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(prefix)) {
      rm(path.join(rootDir, entry));
    }
  }
}

// Fixed set of build/test output paths removed on every `npm run clean`.
const staticTargets = [
  "dist",
  "typings",
  "coverage",
  "__testspersistence__",
  "temp",
  "__testsstorage__",
  ".nyc_output",
  "debug.log"
];

// Glob patterns (relative to rootDir) removed on every `npm run clean`.
const globTargets = ["*.log", "*.vsix", "*.tgz"];

for (const target of staticTargets) {
  rm(path.join(rootDir, target));
}

for (const pattern of globTargets) {
  rmGlob(pattern);
}

// `npm run clean:deep` additionally removes leftover test data directories
// (e.g. `__blobstorage__`) whose names vary per test run.
if (process.argv.includes("--deep")) {
  rmPrefix("__*");
}
