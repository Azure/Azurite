/**
 * Cross-platform clean script that replaces the rimraf CLI.
 * Removes build artifacts, logs, and temporary directories.
 *
 * Usage:
 *   node scripts/clean.js          (standard clean)
 *   node scripts/clean.js --deep   (deep clean, also removes debug.log and __* dirs)
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

/**
 * Remove a file or directory at the given absolute path.
 * Silently ignores ENOENT (already missing). Retries transient errors
 * (EPERM/EBUSY on Windows locked files) before giving up.
 */
function rm(target) {
  try {
    fs.rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100
    });
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Warning: could not remove ${target}: ${err.message}`);
    }
  }
}

/**
 * Remove all entries in rootDir matching a simple glob pattern (e.g. "*.log").
 * Only supports single-level "*.ext" patterns in the project root.
 */
function rmGlob(pattern) {
  // Extract the extension from a "*.ext" pattern
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
 * Remove all entries in rootDir matching a prefix pattern (e.g. "__*").
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

// Standard clean targets (matches the old "clean" npm script):
// rimraf dist typings *.log coverage __testspersistence__ temp __testsstorage__ .nyc_output debug.log *.vsix *.tgz
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

const globTargets = ["*.log", "*.vsix", "*.tgz"];

// Remove static targets
for (const target of staticTargets) {
  rm(path.join(rootDir, target));
}

// Remove glob targets
for (const pattern of globTargets) {
  rmGlob(pattern);
}

// Deep clean: also remove debug.log (already covered above) and all __* entries
if (process.argv.includes("--deep")) {
  rmPrefix("__*");
}
