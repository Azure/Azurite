import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { installAndRunVsixSession } from "./installAndRunVsixSession";
import {
  packageLocalVsix,
  resolveMarketplaceVsixForUpgrade
} from "./resolveVsixToTest";
import { getFreePorts } from "../utils/freePorts";

/**
 * Drives the VSIX upgrade compatibility scenario, mirroring what
 * blobUpgrade/queueUpgrade/tableUpgrade.test.ts and dockerUpgrade.test.ts do
 * for the npm package and Docker image: seed blob/queue/table data with the
 * latest **published Marketplace** .vsix, then install the **local
 * (unreleased) build** .vsix over the same on-disk workspace and verify the
 * data survived. Run via `npm run test:upgrade:vsix` (this is the third of
 * three phases that script chains together).
 */
async function main(): Promise<void> {
  let workspaceDir: string | undefined;
  let oldVsixTempDir: string | undefined;
  let newVsixTempDir: string | undefined;

  try {
    workspaceDir = mkdtempSync(join(tmpdir(), "azurite-vsix-upgrade-data-"));
    const { vsixPath: oldVsixPath, tempDir: oldTempDir } =
      await resolveMarketplaceVsixForUpgrade();
    oldVsixTempDir = oldTempDir;
    const { vsixPath: newVsixPath, tempDir: newTempDir } = packageLocalVsix();
    newVsixTempDir = newTempDir;

    // Allocate free ports once here (not inside the seed/verify VS Code
    // processes) so both phases agree on the same ports without ever
    // touching the well-known defaults a developer's own Azurite instance
    // may already be listening on - see upgradeTestUtils.js.
    const [blobPort, queuePort, tablePort] = await getFreePorts(3);
    const portEnv = {
      AZURITE_VSIX_UPGRADE_BLOB_PORT: String(blobPort),
      AZURITE_VSIX_UPGRADE_QUEUE_PORT: String(queuePort),
      AZURITE_VSIX_UPGRADE_TABLE_PORT: String(tablePort)
    };

    // 1. Seed blob/queue/table data with the OLD (latest published Marketplace) vsix.
    await installAndRunVsixSession(
      oldVsixPath,
      workspaceDir,
      join(__dirname, "upgradeSuite", "seedIndex.js"),
      portEnv
    );

    // 2. Install the NEW (local build) vsix over the SAME workspace and verify.
    await installAndRunVsixSession(
      newVsixPath,
      workspaceDir,
      join(__dirname, "upgradeSuite", "verifyIndex.js"),
      portEnv
    );
  } finally {
    if (workspaceDir) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
    if (oldVsixTempDir) {
      rmSync(oldVsixTempDir, { recursive: true, force: true });
    }
    if (newVsixTempDir) {
      rmSync(newVsixTempDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
