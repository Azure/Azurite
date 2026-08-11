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
 * True if `version` is a plausible "old" release relative to `baseline`: it
 * sorts at or before `baseline` per semver ordering. Published artifacts are
 * always older code generations even when their version number happens to
 * match the local `package.json` (the normal state right after a release cuts
 * a version bump commit but npm/Marketplace/MCR haven't caught up yet, or the
 * local checkout simply hasn't bumped the version since that release). Only
 * versions strictly newer than the local version are rejected, since those
 * can only occur on a stale checkout and would otherwise make the suite test
 * a downgrade instead of an upgrade.
 */
function isAtOrOlderThan(version: string, baseline: string): boolean {
  return compareSemver(version, baseline) <= 0;
}

/**
 * Returns the newest version published to the npm registry that is no newer
 * than `localVersion`, excluding pre-releases.
 */
export async function getLatestPublishedNpmVersion(
  localVersion: string = getLocalVersion()
): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}`);
  if (!res.ok) {
    throw new Error(
      `Failed to query npm registry for ${NPM_PACKAGE_NAME}: HTTP ${res.status}`
    );
  }
  const json: { versions?: Record<string, unknown> } = await res.json();
  const versions = Object.keys(json.versions ?? {})
    .filter((v) => !v.includes("-") && isAtOrOlderThan(v, localVersion))
    .sort(compareSemver);
  const latest = versions[versions.length - 1];
  if (!latest) {
    throw new Error(
      `No published npm versions of ${NPM_PACKAGE_NAME} at or older than the local version (${localVersion}) were found`
    );
  }
  return latest;
}

/**
 * Returns the newest version currently published to the VS Code Marketplace.
 * Unlike the npm/Docker resolvers, this is a true "latest" lookup with no
 * exclusion of the local version: it's only used to pick which VSIX to
 * install/activate/start/stop (not to drive an old -> new upgrade scenario),
 * so it must still return the local version once that release is published.
 */
export async function getLatestPublishedMarketplaceVersion(): Promise<string> {
  const versions = await fetchMarketplaceVersions();
  const latest = versions[versions.length - 1];
  if (!latest) {
    throw new Error(`No published Marketplace versions found`);
  }
  return latest;
}

/**
 * Returns the newest Marketplace-published version that is no newer than
 * `localVersion` (see `getLatestPublishedNpmVersion` for why this cap
 * matters) - used as the "old" side of the VSIX upgrade scenario, where an
 * uncapped lookup could pick a version newer than the local build and turn
 * the test into an undetected downgrade.
 */
export async function getLatestPublishedMarketplaceVersionAtOrOlderThanLocal(
  localVersion: string = getLocalVersion()
): Promise<string> {
  const versions = await fetchMarketplaceVersions();
  const capped = versions.filter((v) => isAtOrOlderThan(v, localVersion));
  const latest = capped[capped.length - 1];
  if (!latest) {
    throw new Error(
      `No published Marketplace versions at or older than the local version (${localVersion}) were found`
    );
  }
  return latest;
}

async function fetchMarketplaceVersions(): Promise<string[]> {
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
  return versions.filter((v) => SEMVER_TAG_PATTERN.test(v)).sort(compareSemver);
}

function parseSemver(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
} {
  // Build metadata (e.g. "+ci.1") doesn't participate in SemVer precedence -
  // strip it before splitting off the prerelease, which itself always comes
  // before any "+" per the MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD] grammar.
  const plusIndex = version.indexOf("+");
  const withoutBuild = plusIndex === -1 ? version : version.slice(0, plusIndex);
  const hyphenIndex = withoutBuild.indexOf("-");
  const core = hyphenIndex === -1 ? withoutBuild : withoutBuild.slice(0, hyphenIndex);
  const prerelease = hyphenIndex === -1 ? "" : withoutBuild.slice(hyphenIndex + 1);
  const [major, minor, patch] = core.split(".").map(Number);
  return { major, minor, patch, prerelease: prerelease ? prerelease.split(".") : [] };
}

/**
 * Full SemVer 2.0.0 precedence comparison (https://semver.org/#spec-item-11),
 * not just numeric MAJOR.MINOR.PATCH - `localVersion` (read straight from
 * package.json, unlike the remote version lists which are pre-filtered to
 * plain X.Y.Z) can carry a prerelease suffix like "3.36.0-beta.1". Naively
 * splitting on "." and calling Number() on each part turns "0-beta" into
 * NaN, breaking every comparison against that baseline and letting the
 * resolver pick a version newer than local, undetected. Exported so
 * versionResolver.test.ts can cover it directly without hitting the network.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  // A version with no prerelease has higher precedence than one with any.
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
  if (pa.prerelease.length === 0) return 1;
  if (pb.prerelease.length === 0) return -1;

  const len = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ai = pa.prerelease[i];
    const bi = pb.prerelease[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const an = Number(ai);
    const bn = Number(bi);
    const aIsNum = ai !== "" && !Number.isNaN(an);
    const bIsNum = bi !== "" && !Number.isNaN(bn);
    if (aIsNum && bIsNum) {
      if (an !== bn) return an - bn;
    } else if (aIsNum !== bIsNum) {
      // Numeric identifiers always have lower precedence than alphanumeric ones.
      return aIsNum ? -1 : 1;
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Returns the newest plain semver tag (e.g. "3.35.0") published to the public
 * MCR repository `mcr.microsoft.com/azure-storage/azurite` that is no newer
 * than `localVersion` (see `getLatestPublishedNpmVersion` for why),
 * excluding architecture-suffixed tags (-amd64/-arm64), preview tags, and
 * "latest".
 */
export async function getLatestPublishedDockerTag(
  localVersion: string = getLocalVersion()
): Promise<string> {
  const tags = await fetchAllMcrTags();
  const filtered = tags
    .filter((t) => SEMVER_TAG_PATTERN.test(t) && isAtOrOlderThan(t, localVersion))
    .sort(compareSemver);
  const latest = filtered[filtered.length - 1];
  if (!latest) {
    throw new Error(
      `No published MCR image tags found for ${MCR_REPOSITORY} at or older than the local version (${localVersion})`
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
