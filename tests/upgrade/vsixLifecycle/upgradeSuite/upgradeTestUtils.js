const path = require("path");

// The fixture/uploader/codec helpers are TypeScript, compiled by `npm run
// build` (tsconfig includes `tests/**/*.ts`) alongside the product code -
// required here from `dist/` so the seed/verify phases share the exact same
// fixtures and assertions as the npm and Docker upgrade suites.
const DIST_TESTS_UPGRADE = path.join(__dirname, "..", "..", "..", "..", "dist", "tests", "upgrade");

const BLOB_PORT = 10000;
const QUEUE_PORT = 10001;
const TABLE_PORT = 10002;

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
