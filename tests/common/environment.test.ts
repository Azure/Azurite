import * as assert from "assert";

import Environment from "../../src/common/Environment";

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

  it("defaults skipApiVersionCheck to false @loki", () => {
    const env = new Environment();

    assert.strictEqual(env.skipApiVersionCheck(), false);
  });

  it("returns true when env var AZURITE_SKIP_API_VERSION_CHECK is true @loki", () => {
    process.env.AZURITE_SKIP_API_VERSION_CHECK = "true";

    const env = new Environment();

    assert.strictEqual(env.skipApiVersionCheck(), true);
  });

  it("returns false when env var AZURITE_SKIP_API_VERSION_CHECK is false @loki", () => {
    process.env.AZURITE_SKIP_API_VERSION_CHECK = "false";

    const env = new Environment();

    assert.strictEqual(env.skipApiVersionCheck(), false);
  });

  it("returns true when skipApiVersionCheck flag is set @loki", () => {
    process.argv.push("--skipApiVersionCheck");

    const env = new Environment();

    assert.strictEqual(env.skipApiVersionCheck(), true);
  });
});
