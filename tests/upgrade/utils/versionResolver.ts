import { readFileSync } from "fs";
import { join } from "path";

/**
 * Resolves version numbers dynamically so the upgrade test suite never needs
 * a hardcoded "old" version and keeps working release after release.
 */

const PACKAGE_JSON_PATH = join(__dirname, "../../../package.json");
const NPM_PACKAGE_NAME = "azurite";
const MARKETPLACE_PUBLISHER = "Azurite";
const MARKETPLACE_EXTENSION = "azurite";
const MCR_REPOSITORY = "azure-storage/azurite";
const SEMVER_TAG_PATTERN = /^\d+\.\d+\.\d+$/;

export function getLocalVersion(): string {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
  return pkg.version as string;
}

/**
 * Returns the newest version published to the npm registry, excluding
 * pre-releases and the version currently checked out locally.
 */
export async function getLatestPublishedNpmVersion(
  excludeVersion: string = getLocalVersion()
): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}`);
  if (!res.ok) {
    throw new Error(
      `Failed to query npm registry for ${NPM_PACKAGE_NAME}: HTTP ${res.status}`
    );
  }
  const json: { versions?: Record<string, unknown> } = await res.json();
  const versions = Object.keys(json.versions ?? {})
    .filter((v) => v !== excludeVersion && !v.includes("-"))
    .sort(compareSemver);
  const latest = versions[versions.length - 1];
  if (!latest) {
    throw new Error(
      `No published npm versions of ${NPM_PACKAGE_NAME} found (excluding ${excludeVersion})`
    );
  }
  return latest;
}

/**
 * Returns the newest version published to the VS Code Marketplace, excluding
 * the version currently checked out locally.
 */
export async function getLatestPublishedMarketplaceVersion(
  excludeVersion: string = getLocalVersion()
): Promise<string> {
  const requestBody = {
    filters: [
      {
        criteria: [
          {
            filterType: 7,
            value: `${MARKETPLACE_PUBLISHER}.${MARKETPLACE_EXTENSION}`
          }
        ]
      }
    ],
    flags: 0x1 // IncludeVersions
  };
  const res = await fetch(
    "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json;api-version=3.0-preview.1"
      },
      body: JSON.stringify(requestBody)
    }
  );
  if (!res.ok) {
    throw new Error(
      `Failed to query Marketplace for ${MARKETPLACE_EXTENSION}: HTTP ${res.status}`
    );
  }
  const json = await res.json();
  const versions: string[] =
    json?.results?.[0]?.extensions?.[0]?.versions?.map(
      (v: { version: string }) => v.version
    ) ?? [];
  const filtered = versions
    .filter((v) => v !== excludeVersion && SEMVER_TAG_PATTERN.test(v))
    .sort(compareSemver);
  const latest = filtered[filtered.length - 1];
  if (!latest) {
    throw new Error(
      `No published Marketplace versions found (excluding ${excludeVersion})`
    );
  }
  return latest;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * Returns the newest plain semver tag (e.g. "3.35.0") published to the public
 * MCR repository `mcr.microsoft.com/azure-storage/azurite`, excluding
 * architecture-suffixed tags (-amd64/-arm64), preview tags, "latest", and the
 * version currently checked out locally.
 */
export async function getLatestPublishedDockerTag(
  excludeVersion: string = getLocalVersion()
): Promise<string> {
  const tags = await fetchAllMcrTags();
  const filtered = tags
    .filter((t) => SEMVER_TAG_PATTERN.test(t) && t !== excludeVersion)
    .sort(compareSemver);
  const latest = filtered[filtered.length - 1];
  if (!latest) {
    throw new Error(
      `No published MCR image tags found for ${MCR_REPOSITORY} (excluding ${excludeVersion})`
    );
  }
  return latest;
}

async function fetchAllMcrTags(): Promise<string[]> {
  const tags: string[] = [];
  let url: string | undefined = `https://mcr.microsoft.com/v2/${MCR_REPOSITORY}/tags/list`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to query MCR tags for ${MCR_REPOSITORY}: HTTP ${res.status}`
      );
    }
    const json: { tags?: string[] } = await res.json();
    tags.push(...(json.tags ?? []));

    const link = res.headers.get("link");
    const nextMatch = link?.match(/<([^>]+)>;\s*rel="next"/);
    // The Link header's URL can be relative (e.g. "/v2/<repo>/tags/list?..."),
    // so resolve it against the current URL rather than assigning it directly.
    url = nextMatch ? new URL(nextMatch[1], url).toString() : undefined;
  }

  return tags;
}
