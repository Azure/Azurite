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

  // Regression test: build metadata (e.g. "+ci.1") doesn't participate in
  // SemVer precedence and must be stripped before parsing, or "0+ci" turns
  // into NaN and every comparison against that baseline breaks.
  it("ignores build metadata when comparing versions", () => {
    assert.strictEqual(compareSemver("3.36.0+ci.1", "3.36.0"), 0);
    assert.strictEqual(compareSemver("3.36.0+ci.1", "3.36.0+ci.2"), 0);
    assert.ok(compareSemver("3.36.0-beta.1+build.5", "3.36.0+build.9") < 0);
  });

  // Regression test: numeric prerelease identifiers above
  // Number.MAX_SAFE_INTEGER round to the same double, so comparing via
  // Number() subtraction reported distinct valid versions as equal.
  it("orders numeric prerelease identifiers beyond Number.MAX_SAFE_INTEGER", () => {
    assert.ok(
      compareSemver(
        "3.36.0-alpha.9007199254740992",
        "3.36.0-alpha.9007199254740993"
      ) < 0
    );
    assert.notStrictEqual(
      compareSemver(
        "3.36.0-alpha.9007199254740992",
        "3.36.0-alpha.9007199254740993"
      ),
      0
    );
  });
});
