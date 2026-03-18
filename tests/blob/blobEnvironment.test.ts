import * as assert from "assert";

import BlobEnvironment from "../../src/blob/BlobEnvironment";

describe("BlobEnvironment", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = ["node", "azurite-blob"];
    delete process.env.AZURITE_SKIP_API_VERSION_CHECK;
  });

  afterEach(() => {
    process.argv = originalArgv;
    delete process.env.AZURITE_SKIP_API_VERSION_CHECK;
  });

  it("defaults skipApiVersionCheck to false @loki", () => {
    const env = new BlobEnvironment();

    assert.strictEqual(env.skipApiVersionCheck(), false);
  });

  it("returns true when env var AZURITE_SKIP_API_VERSION_CHECK is true @loki", () => {
    process.env.AZURITE_SKIP_API_VERSION_CHECK = "true";

    const env = new BlobEnvironment();

    assert.strictEqual(env.skipApiVersionCheck(), true);
  });

  it("returns false when env var AZURITE_SKIP_API_VERSION_CHECK is false @loki", () => {
    process.env.AZURITE_SKIP_API_VERSION_CHECK = "false";

    const env = new BlobEnvironment();

    assert.strictEqual(env.skipApiVersionCheck(), false);
  });

  it("returns true when skipApiVersionCheck flag is set @loki", () => {
    process.argv.push("--skipApiVersionCheck");

    const env = new BlobEnvironment();

    assert.strictEqual(env.skipApiVersionCheck(), true);
  });
});
