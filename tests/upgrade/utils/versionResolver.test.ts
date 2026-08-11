import * as assert from "assert";

import { compareSemver } from "./versionResolver";

// Pure unit test, no network/local build required. Kept under the @upgrade
// grep tag purely so it rides along with `npm run test:upgrade`.
describe("compareSemver @upgrade", () => {
  it("orders plain X.Y.Z versions numerically, not lexicographically", () => {
    assert.ok(compareSemver("3.9.0", "3.10.0") < 0);
    assert.ok(compareSemver("3.10.0", "3.9.0") > 0);
    assert.strictEqual(compareSemver("3.36.0", "3.36.0"), 0);
  });

  // Regression test: local package.json can carry a prerelease suffix (e.g.
  // right after a version bump commit, before that release is published).
  // A naive `.split(".").map(Number)` comparator turns "0-beta" into NaN,
  // which broke every comparison against that baseline.
  it("treats a version with no prerelease as newer than the same version with one", () => {
    assert.ok(compareSemver("3.36.0", "3.36.0-beta.1") > 0);
    assert.ok(compareSemver("3.36.0-beta.1", "3.36.0") < 0);
  });

  it("orders prerelease identifiers per SemVer precedence rules", () => {
    assert.ok(compareSemver("3.36.0-alpha", "3.36.0-beta") < 0);
    assert.ok(compareSemver("3.36.0-alpha.1", "3.36.0-alpha.2") < 0);
    // Numeric prerelease identifiers compare numerically, not as strings.
    assert.ok(compareSemver("3.36.0-alpha.2", "3.36.0-alpha.10") < 0);
  });
});
