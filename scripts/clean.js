const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

function rm(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Warning: could not remove ${target}: ${err.message}`);
    }
  }
}

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

for (const target of staticTargets) {
  rm(path.join(rootDir, target));
}

for (const pattern of globTargets) {
  rmGlob(pattern);
}

if (process.argv.includes("--deep")) {
  rmPrefix("__*");
}
