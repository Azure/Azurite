const path = require("path");
const { run: runMocha } = require("../runMochaSuite");

// extensionTestsPath for both upgrade phases. seed.test.js and verify.test.js
// share this directory (they need the same fixtures/utils) but must never
// run in the same VS Code session, so AZURITE_VSIX_UPGRADE_PHASE - set per
// call by runVsixUpgradeTest.ts - picks the single file to load.
const PHASE_FILES = {
  seed: "seed.test.js",
  verify: "verify.test.js"
};

function run() {
  const phase = process.env.AZURITE_VSIX_UPGRADE_PHASE;
  const file = PHASE_FILES[phase];
  if (!file) {
    throw new Error(
      `AZURITE_VSIX_UPGRADE_PHASE must be one of ${Object.keys(
        PHASE_FILES
      ).join(", ")}, got: ${phase}`
    );
  }
  return runMocha(__dirname, [path.resolve(__dirname, file)]);
}

module.exports = { run };
