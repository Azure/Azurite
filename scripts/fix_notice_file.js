#!/usr/bin/env node

/**
 * fix_notice_file.js
 *
 * Generates/updates NOTICE.txt for a Node.js project.
 *
 * Behaviour:
 *  - Reads package-lock.json
 *  - Fetches package metadata from npm registry
 *  - Resolves GitHub repository URL
 *  - Checks common upstream NOTICE file paths
 *  - Includes actual upstream NOTICE content only when found
 *  - Uses bounded parallel processing for speed
 *
 * Requirements:
 *  - Node.js 21+
 *
 * Usage:
 *  node fix_notice_file.js
 *  node fix_notice_file.js --concurrency=12
 */

const fs = require("fs");
const LOCK_FILE = "package-lock.json";
const OUTPUT_FILE = "NOTICE.txt";

const concurrencyArg = process.argv.find((arg) =>
  arg.startsWith("--concurrency=")
);

const CONCURRENCY = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 8;

if (!Number.isInteger(CONCURRENCY) || CONCURRENCY <= 0) {
  throw new Error("Invalid --concurrency value. Example: --concurrency=8");
}

const NPM_REGISTRY = "https://registry.npmjs.org";

const COMMON_NOTICE_FILE_NAMES = [
  "NOTICE",
  "NOTICE.txt",
  "NOTICE.md",
  "Notices",
  "NOTICES",
  "THIRD-PARTY-NOTICES",
  "THIRD-PARTY-NOTICES.txt"
];

const COMMON_BRANCHES = ["main", "master"];
/**
 * Small dependency-free concurrency limiter.
 */

function createLimiter(limit) {
  let activeCount = 0;
  const queue = [];

  function next() {
    if (activeCount >= limit || queue.length === 0) return;

    const { fn, resolve, reject } = queue.shift();
    activeCount++;

    Promise.resolve()
      .then(fn)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeCount--;
        next();
      });
  }

  return function limitFn(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

const limit = createLimiter(CONCURRENCY);

/**
 * Simple in-memory cache so the same package metadata is not fetched twice.
 */
const npmMetadataCache = new Map();

function readPackageLock() {
  if (!fs.existsSync(LOCK_FILE)) {
    throw new Error(`${LOCK_FILE} not found. Run this script from repo root.`);
  }

  return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
}

function getPackageNameFromLockPath(lockPath) {
  const parts = lockPath.split("node_modules/");
  const last = parts[parts.length - 1];

  if (last.startsWith("@")) {
    const scopedParts = last.split("/");
    return `${scopedParts[0]}/${scopedParts[1]}`;
  }

  return last.split("/")[0];
}
function normaliseLicense(license) {
  if (!license) {
    return "";
  }

  if (typeof license === "string") {
    return license;
  }

  if (typeof license === "object" && license.type) {
    return license.type;
  }

  return String(license);
}

function extractDependencies(lock) {
  const packages = lock.packages || {};
  const deps = new Map();

  for (const [lockPath, info] of Object.entries(packages)) {
    if (!lockPath.startsWith("node_modules/")) {
      continue;
    }

    const name = getPackageNameFromLockPath(lockPath);
    const version = info.version || "*";
    const key = name ? `${name}@${version}` : "";

    if (!name || deps.has(key)) {
      continue;
    }

    deps.set(key, {
      name,
      version,
      lockPath,
      lockLicense: normaliseLicense(info.license || "")
    });
  }

  return Array.from(deps.values()).sort((a, b) => a.name.localeCompare(b.name));
}
function encodePackageNameForNpm(name) {
  return encodeURIComponent(name).replace(/%40/g, "@");
}

const MAX_FETCH_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 300;
// Abort a single request that stalls so one hung connection cannot block the run.
const REQUEST_TIMEOUT_MS = 15000;
// Guard against a malicious/oversized upstream NOTICE exhausting memory.
const MAX_NOTICE_BYTES = 1024 * 1024; // 1 MiB

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch wrapper that retries transient network/TLS failures and 5xx
 * responses with exponential backoff. Under concurrency, raw.githubusercontent.com
 * and the npm registry can intermittently drop connections (e.g.
 * ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC); without retries a single
 * transient failure would otherwise drop an entire dependency from the output.
 */
async function fetchWithRetry(url, headers) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      // Retry on transient server errors; return everything else (incl. 404).
      if (response.status >= 500 && attempt < MAX_FETCH_ATTEMPTS) {
        lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
      } else {
        return response;
      }
    } catch (error) {
      // Network/TLS errors and timeout aborts are transient and worth retrying.
      lastError = error;
    }

    // No need to wait after the final attempt; we are about to throw.
    if (attempt < MAX_FETCH_ATTEMPTS) {
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, {
    Accept: "application/json",
    "User-Agent": "azurite-notice-generator"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchTextIfExists(url) {
  const response = await fetchWithRetry(url, {
    Accept: "text/plain",
    "User-Agent": "azurite-notice-generator"
  });

  if (!response.ok) {
    return null;
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_NOTICE_BYTES) {
    return null;
  }

  const text = await response.text();

  if (Buffer.byteLength(text, "utf8") > MAX_NOTICE_BYTES) {
    return null;
  }

  if (!text || !text.trim()) {
    return null;
  }

  const trimmed = text.trim();

  // Avoid accidentally including HTML pages.
  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    return null;
  }

  return trimmed;
}

async function fetchNpmMetadata(packageName, logs) {
  if (npmMetadataCache.has(packageName)) {
    logs.push(`📦 npm metadata cache hit: ${packageName}`);
    return npmMetadataCache.get(packageName);
  }

  const npmUrl = `${NPM_REGISTRY}/${encodePackageNameForNpm(packageName)}`;
  logs.push(`🌐 Fetching npm metadata: ${npmUrl}`);

  const metadata = await fetchJson(npmUrl);
  npmMetadataCache.set(packageName, metadata);
  return metadata;
}

function getVersionMetadata(npmMetadata, version) {
  if (version && npmMetadata.versions && npmMetadata.versions[version]) {
    return npmMetadata.versions[version];
  }

  const latest = npmMetadata["dist-tags"] && npmMetadata["dist-tags"].latest;

  if (latest && npmMetadata.versions && npmMetadata.versions[latest]) {
    return npmMetadata.versions[latest];
  }

  return {};
}

function extractRepositoryUrl(npmMetadata, versionMetadata) {
  const repo =
    versionMetadata.repository ||
    npmMetadata.repository ||
    versionMetadata.homepage ||
    npmMetadata.homepage;

  if (!repo) {
    return "";
  }

  if (typeof repo === "string") {
    return repo;
  }

  if (typeof repo === "object" && repo.url) {
    return repo.url;
  }

  return "";
}

function normaliseGitHubRepository(repoUrl) {
  if (!repoUrl) {
    return null;
  }

  let url = repoUrl.trim();

  url = url.replace(/^git\+/, "");
  url = url.replace(/^git:\/\//, "https://");
  url = url.replace(/^github:/, "https://github.com/");

  // Normalise ssh forms, e.g. "ssh://git@github.com/owner/repo.git" or
  // "git+ssh://git@github.com/owner/repo.git" (after stripping "git+"), to
  // https so they pass URL parsing and the host check below.
  url = url.replace(/^ssh:\/\/(?:[^@/]+@)?/, "https://");

  // SCP-like shorthand, e.g. "git@github.com:owner/repo.git".
  if (url.startsWith("git@github.com:")) {
    url = url.replace("git@github.com:", "https://github.com/");
  }

  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // Only allow GitHub over http(s); validate the host explicitly so that
  // look-alike hosts (e.g. "github.com.evil.com" or "evil.com/github.com")
  // are rejected.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (host !== "github.com" && host !== "www.github.com") {
    return null;
  }

  const segments = parsed.pathname
    .split("/")
    .filter((segment) => segment.length > 0);

  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");

  if (!owner || !repo) {
    return null;
  }

  return {
    owner,
    repo,
    canonicalUrl: `https://github.com/${owner}/${repo}`
  };
}

function buildRawNoticeUrls(githubRepo) {
  const urls = [];

  for (const branch of COMMON_BRANCHES) {
    for (const fileName of COMMON_NOTICE_FILE_NAMES) {
      urls.push({
        branch,
        fileName,
        url: `https://raw.githubusercontent.com/${githubRepo.owner}/${githubRepo.repo}/${branch}/${fileName}`
      });
    }
  }

  return urls;
}

function stripHtmlFromNotice(text) {
  let previous;
  let current = text.replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1"); // keep inner text

  // Strip tags repeatedly until the output stabilises. A single pass is not
  // enough because removing one tag can re-form another (e.g. "<scr<script>ipt>"
  // collapses to "<script>"), which would otherwise survive sanitisation.
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, "");
  } while (current !== previous);

  return current.trim();
}

function buildHeader() {
  return `NOTICES AND INFORMATION
Do Not Translate or Localize

This software incorporates material from third parties.

Microsoft makes certain open source code available at
https://3rdpartysource.microsoft.com,
or you may send a request to:

Source Code Compliance Team
Microsoft Corporation
One Microsoft Way
Redmond, WA 98052
USA

Notwithstanding any other terms, you may reverse engineer this software
to the extent required to debug changes to any libraries licensed under
the GNU Lesser General Public License.`;
}

function buildNoticeFile(foundNotices) {
  let output = buildHeader();

  if (foundNotices.length === 0) {
    return `${output}\n`;
  }

  output += `

--------------------------------------------------------------------------------
THIRD-PARTY NOTICES
--------------------------------------------------------------------------------
`;

  for (const item of foundNotices) {
    output += `

--------------------------------------------------------------------------------
${item.packageName}${item.version ? ` ${item.version}` : ""}
Repository: ${item.repositoryUrl}
Notice source: ${item.noticeUrl}
--------------------------------------------------------------------------------

${stripHtmlFromNotice(item.noticeText)}
`;
  }

  return `${output.trim()}\n`;
}

async function findNoticeFileForRepo(dep, githubRepo, logs) {
  const noticeUrls = buildRawNoticeUrls(githubRepo);

  for (const candidate of noticeUrls) {
    logs.push(`🔍 Trying NOTICE URL: ${candidate.url}`);

    const noticeText = await fetchTextIfExists(candidate.url);

    if (noticeText) {
      logs.push(`✅ Found NOTICE for ${dep.name}: ${candidate.url}`);

      return {
        noticeUrl: candidate.url,
        noticeText
      };
    }
  }

  logs.push(`ℹ️  No upstream NOTICE file found for ${dep.name}.`);
  return null;
}

async function analyseDependency(dep) {
  const logs = [];

  logs.push("------------------------------------------------------------");
  logs.push(`📦 Dependency: ${dep.name}`);
  logs.push(`📍 Lock path:   ${dep.lockPath}`);
  logs.push(`📌 Version:     ${dep.version || "UNKNOWN"}`);
  logs.push(`📄 Lock licence:${dep.lockLicense || "UNKNOWN"}`);

  let npmMetadata;

  try {
    npmMetadata = await fetchNpmMetadata(dep.name, logs);
  } catch (error) {
    logs.push(`⚠️  Failed to fetch npm metadata: ${error.message}`);
    return { result: null, logs };
  }

  const versionMetadata = getVersionMetadata(npmMetadata, dep.version);

  const effectiveLicense = normaliseLicense(
    versionMetadata.license || npmMetadata.license || dep.lockLicense || ""
  );

  logs.push(`📄 Effective licence: ${effectiveLicense || "UNKNOWN"}`);

  const repoUrl = extractRepositoryUrl(npmMetadata, versionMetadata);
  logs.push(`📚 Repository from npm metadata: ${repoUrl || "NOT FOUND"}`);

  const githubRepo = normaliseGitHubRepository(repoUrl);

  if (!githubRepo) {
    logs.push(
      "⚠️  Repository is not GitHub or could not be normalised. Skipping."
    );
    return { result: null, logs };
  }

  logs.push(`✅ Normalised GitHub repo: ${githubRepo.canonicalUrl}`);

  let foundNotice;

  try {
    foundNotice = await findNoticeFileForRepo(dep, githubRepo, logs);
  } catch (error) {
    logs.push(`⚠️  Failed to look up NOTICE file: ${error.message}`);
    return { result: null, logs };
  }

  if (!foundNotice) {
    return { result: null, logs };
  }

  return {
    logs,
    result: {
      packageName: dep.name,
      version: dep.version,
      licence: effectiveLicense,
      repositoryUrl: githubRepo.canonicalUrl,
      noticeUrl: foundNotice.noticeUrl,
      noticeText: foundNotice.noticeText
    }
  };
}

async function main() {
  console.log("\n🔍 Starting NOTICE generation for Node project...\n");

  const lock = readPackageLock();
  const deps = extractDependencies(lock);

  console.log(`📦 Total unique dependencies found: ${deps.length}`);
  console.log(`⚡ Concurrency: ${CONCURRENCY}\n`);

  const tasks = deps.map((dep) => limit(() => analyseDependency(dep)));

  const settledResults = await Promise.allSettled(tasks);

  const foundNotices = [];

  for (const settled of settledResults) {
    if (settled.status === "rejected") {
      console.error("❌ Dependency analysis failed:", settled.reason);
      continue;
    }

    const { logs, result } = settled.value;

    // Print logs grouped per dependency to avoid interleaved parallel logs.
    console.log(logs.join("\n"));

    if (result) {
      foundNotices.push(result);
    }
  }

  foundNotices.sort((a, b) => a.packageName.localeCompare(b.packageName));

  const output = buildNoticeFile(foundNotices);
  fs.writeFileSync(OUTPUT_FILE, output, "utf8");

  console.log("\n============================================================");
  console.log("✅ NOTICE generation complete.");
  console.log(`📝 Output file: ${OUTPUT_FILE}`);
  console.log(`📌 Upstream NOTICE files included: ${foundNotices.length}`);

  if (foundNotices.length > 0) {
    console.log("\nIncluded NOTICE entries:");

    for (const item of foundNotices) {
      console.log(
        `- ${item.packageName}@${item.version || "unknown"} from ${item.noticeUrl}`
      );
    }
  } else {
    console.log(
      "ℹ️  No upstream NOTICE files were found. Minimal NOTICE was generated."
    );
  }

  console.log("============================================================\n");
}

main().catch((error) => {
  console.error(`❌ Failed: ${error.stack || error.message}`);
  process.exit(1);
});
