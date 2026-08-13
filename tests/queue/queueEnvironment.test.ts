import * as assert from "assert";

import QueueEnvironment from "../../src/queue/QueueEnvironment";

describe("QueueEnvironment", () => {
  const originalArgv = process.argv;
  const originalSkipApiVersionCheck =
    process.env.AZURITE_SKIP_API_VERSION_CHECK;

  beforeEach(() => {
    process.argv = ["node", "azurite-queue"];
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

    const env = new QueueEnvironment();

    assert.strictEqual(env.skipApiVersionCheck(), true);
  });
});
