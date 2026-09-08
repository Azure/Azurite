import * as assert from "assert";

import Environment from "../../src/common/Environment";
import {
  parseOAuthLevel,
  shouldSkipApiVersionCheck
} from "../../src/common/utils/environment";

describe("Environment", () => {
  const originalArgv = process.argv;
  const originalSkipApiVersionCheck =
    process.env.AZURITE_SKIP_API_VERSION_CHECK;

  beforeEach(() => {
    process.argv = ["node", "azurite"];
    delete process.env.AZURITE_SKIP_API_VERSION_CHECK;
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalSkipApiVersionCheck === undefined) {
      delete process.env.AZURITE_SKIP_API_VERSION_CHECK;
    } else {
      process.env.AZURITE_SKIP_API_VERSION_CHECK = originalSkipApiVersionCheck;
    }
  });

  it("uses AZURITE_SKIP_API_VERSION_CHECK @loki", () => {
    process.env.AZURITE_SKIP_API_VERSION_CHECK = "true";

    const env = new Environment();

    assert.strictEqual(env.skipApiVersionCheck(), true);
  });

  it("rejects --oauth without a value @loki", () => {
    process.argv.push("--oauth");

    assert.throws(
      () => new Environment().oauth(),
      /Must provide a valid value for parameter --oauth/
    );
  });

  it("rejects an unsupported --oauth value @loki", () => {
    process.argv.push("--oauth", "invalid");

    assert.throws(
      () => new Environment().oauth(),
      /Must provide a valid value for parameter --oauth/
    );
  });

  describe("parseOAuthLevel", () => {
    it("accepts basic case-insensitively @loki", () => {
      assert.strictEqual(parseOAuthLevel("BASIC"), "basic");
    });

    it("returns undefined when OAuth is not configured @loki", () => {
      assert.strictEqual(parseOAuthLevel(undefined), undefined);
    });
  });

  describe("shouldSkipApiVersionCheck", () => {
    const environmentCases: Array<[string | undefined, boolean]> = [
      [undefined, false],
      ["", false],
      ["false", false],
      ["1", false],
      ["True", false],
      ["TRUE", false],
      ["true", true]
    ];

    for (const [value, expected] of environmentCases) {
      it(`returns ${expected} for environment value ${JSON.stringify(value)} @loki`, () => {
        if (value === undefined) {
          delete process.env.AZURITE_SKIP_API_VERSION_CHECK;
        } else {
          process.env.AZURITE_SKIP_API_VERSION_CHECK = value;
        }

        assert.strictEqual(shouldSkipApiVersionCheck(), expected);
      });
    }

    it("lets the CLI flag enable skipping when the environment value is false @loki", () => {
      process.env.AZURITE_SKIP_API_VERSION_CHECK = "false";

      assert.strictEqual(
        shouldSkipApiVersionCheck({ skipApiVersionCheck: true }),
        true
      );
    });
  });
});
