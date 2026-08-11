const path = require("path");

// The fixture/uploader/codec helpers are TypeScript, compiled by `npm run
// build` (tsconfig includes `tests/**/*.ts`) alongside the product code -
// required here from `dist/` so the seed/verify phases share the exact same
// fixtures and assertions as the npm and Docker upgrade suites.
const DIST_TESTS_UPGRADE = path.join(__dirname, "..", "..", "..", "..", "dist", "tests", "upgrade");

// Ports are allocated once (as genuinely free ports) by runVsixUpgradeTest.ts
// and handed to both the seed and verify phases via env vars - never the
// well-known Azurite defaults. Using the defaults would let an already-running
// developer Azurite instance impersonate both phases: azurite.start swallows
// EADDRINUSE (VSCServerManagerBase.start() only notifies onStartFail, it
// never rejects) and waitForHttpUp() only checks that *some* HTTP server
// answers, so the seed phase could silently write fixtures into - and the
// verify phase read them back from - that unrelated instance, passing
// without exercising either .vsix and corrupting the developer's real data.
function requirePort(envVar) {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `${envVar} is not set - these tests must be launched via runVsixUpgradeTest.ts, ` +
        "which allocates free ports and passes them through extensionTestsEnv."
    );
  }
  return Number(value);
}

const BLOB_PORT = requirePort("AZURITE_VSIX_UPGRADE_BLOB_PORT");
const QUEUE_PORT = requirePort("AZURITE_VSIX_UPGRADE_QUEUE_PORT");
const TABLE_PORT = requirePort("AZURITE_VSIX_UPGRADE_TABLE_PORT");

// Fixed (not random) fixture identifiers so the seed phase (old Marketplace
// vsix) and verify phase (local vsix), which run as two separate VS Code
// processes, address the exact same container/queue/table.
const CONTAINER_NAME = "vsix-upgrade-test-container";
const FIXTURE_SUFFIX = "vsixupgrade";

module.exports = {
  DIST_TESTS_UPGRADE,
  BLOB_PORT,
  QUEUE_PORT,
  TABLE_PORT,
  CONTAINER_NAME,
  FIXTURE_SUFFIX
};
