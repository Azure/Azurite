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
 *  - Node.js 18+
 *
 * Usage:
 *  node fix_notice_file.js
 *  node fix_notice_file.js --check-all
 *  node fix_notice_file.js --check-all --concurrency=12
 */

const fs = require("fs");
const LOCK_FILE = "package-lock.json";
const OUTPUT_FILE = "NOTICE.txt";

const CHECK_ALL = process.argv.includes("--check-all");

const concurrencyArg = process.argv.find((arg) =>

  arg.startsWith("--concurrency=")
);

const CONCURRENCY = concurrencyArg
  ? Number(concurrencyArg.split("=")[1]) : 8;

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
  "THIRD-PARTY-NOTICES.txt",
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
 * Simple in-memory cache s* the same package metadata is not *etched twice.
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
function normaliseLicense(license){
  if (!license) {
    return "";  }

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

    if (!name || deps.has(name)) {
      continue;
    }

    deps.set(name, {
      name,
      version: info.version || "*",
      lockPath,
      lockLicense: normaliseLicense(info.license || ""),
    });
  }

  return Array.from(deps.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function isNoticeCandidate(license) {
  if (!license) {
    return false;
  }

  const lower = license.toLowerCase();

  return (
    lower.includes("apache") ||
    lower.includes("gpl") ||
    lower.includes("lgpl") ||
    lower.includes("mpl") ||
    lower.includes("epl")
  );
}

function encodePackageNameForNpm(name) {
  return encodeURIComponent(name).replace("%40", "@");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "azurite-notice-generator",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchTextIfExists(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "azurite-notice-generator",
    },
  });

  if (!response.ok) {
    return null;
  }

  const text = await response.text();

  if (!text || !text.trim()) {
    return null;
  }

  const trimmed = text.trim();

  // Avoid accidentally including HTML pages.
  if (
    trimmed.startsWith("<!DOCTYPE html") ||
    trimmed.startsWith("<html")
  ) {
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

  if (url.startsWith("git@github.com:")) {
    url = url.replace("git@github.com:", "https://github.com/");
  }

  if (!url.includes("github.com")) {
    return null;
  }

  url = url.split("#")[0].split("?")[0];
  url = url.replace(/\.git$/, "");

  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);

  if (!match) {
    return null;
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  return {
    owner,
    repo,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}

function buildRawNoticeUrls(githubRepo) {
  const urls = [];

  for (const branch of COMMON_BRANCHES) {
    for (const fileName of COMMON_NOTICE_FILE_NAMES) {
      urls.push({
        branch,
        fileName,
        url: `https://raw.githubusercontent.com/${githubRepo.owner}/${githubRepo.repo}/${branch}/${fileName}`,
      });
    }
  }

  return urls;
}

function stripHtmlFromNotice(text) {
  return text
    .replace(/<a\s+[^"']+["'][^>]*>.*?<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
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
        noticeText,
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
    versionMetadata.license ||
      npmMetadata.license ||
      dep.lockLicense ||
      ""
  );

  logs.push(`📄 Effective licence: ${effectiveLicense || "UNKNOWN"}`);

  if (!CHECK_ALL && !isNoticeCandidate(effectiveLicense)) {
    logs.push("🚫 Licence not in NOTICE-candidate set. Skipping NOTICE lookup.");
    return { result: null, logs };
  }

  if (CHECK_ALL) {
    logs.push("🔎 --check-all enabled. Checking NOTICE regardless of licence.");
  } else {
    logs.push("✅ Candidate licence detected. Checking upstream NOTICE.");
  }

  const repoUrl = extractRepositoryUrl(npmMetadata, versionMetadata);
  logs.push(`📚 Repository from npm metadata: ${repoUrl || "NOT FOUND"}`);

  const githubRepo = normaliseGitHubRepository(repoUrl);

  if (!githubRepo) {
    logs.push("⚠️  Repository is not GitHub or could not be normalised. Skipping.");
    return { result: null, logs };
  }

  logs.push(`✅ Normalised GitHub repo: ${githubRepo.canonicalUrl}`);

  const foundNotice = await findNoticeFileForRepo(dep, githubRepo, logs);

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
      noticeText: foundNotice.noticeText,
    },
  };
}

async function main() {
  console.log("\n🔍 Starting NOTICE generation for Node project...\n");

  const lock = readPackageLock();
  const deps = extractDependencies(lock);

  console.log(`📦 Total unique dependencies found: ${deps.length}`);
  console.log(`🔧 Mode: ${CHECK_ALL ? "check all dependencies" : "check candidate licences only"}`);
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
      console.log(`- ${item.packageName}@${item.version || "unknown"} from ${item.noticeUrl}`);
    }
  } else {
    console.log("ℹ️  No upstream NOTICE files were found. Minimal NOTICE was generated.");
  }

  console.log("============================================================\n");
}

main().catch((error) => {
  console.error(`❌ Failed: ${error.stack || error.message}`);
  process.exit(1);
});