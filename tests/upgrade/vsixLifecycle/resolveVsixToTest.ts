import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { getLatestPublishedMarketplaceVersion } from "../utils/versionResolver";

const MARKETPLACE_PUBLISHER = "Azurite";
const MARKETPLACE_EXTENSION = "azurite";

/**
 * Selects which .vsix gets installed/exercised by the lifecycle test, driven
 * by the AZURITE_VSIX_UNDER_TEST env var so the same test code works for:
 *  - the local working tree (default, e.g. every PR/pipeline run)
 *  - the latest Marketplace-published version (e.g. nightly regression)
 *  - an explicit version number or path to a pre-built .vsix
 */
export async function resolveVsixToTest(): Promise<string> {
  const mode = process.env.AZURITE_VSIX_UNDER_TEST ?? "local";

  if (mode === "local") {
    return packageLocalVsix();
  }

  if (mode.endsWith(".vsix") && existsSync(mode)) {
    return mode;
  }

  const version =
    mode === "published-latest"
      ? await getLatestPublishedMarketplaceVersion()
      : mode;
  return downloadMarketplaceVsix(version);
}

function packageLocalVsix(): string {
  const outDir = mkdtempSync(join(tmpdir(), "azurite-local-vsix-"));
  const outPath = join(outDir, "azurite-local.vsix");
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, ["vsce", "package", "--out", outPath], {
    stdio: "inherit",
    // Node blocks spawning .cmd/.bat files directly on Windows unless
    // shell: true is set (see Node.js CVE-2024-27980).
    shell: process.platform === "win32",
    cwd: join(__dirname, "..", "..", "..")
  });
  return outPath;
}

async function downloadMarketplaceVsix(version: string): Promise<string> {
  const url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${MARKETPLACE_PUBLISHER}/vsextensions/${MARKETPLACE_EXTENSION}/${version}/vspackage`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download Marketplace VSIX version ${version}: HTTP ${res.status}`
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const outDir = mkdtempSync(
    join(tmpdir(), `azurite-marketplace-vsix-${version}-`)
  );
  const outPath = join(outDir, `azurite-${version}.vsix`);
  writeFileSync(outPath, buffer);
  return outPath;
}
