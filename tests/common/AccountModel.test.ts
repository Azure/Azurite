import * as assert from "assert";

import {
  AccountConfigError,
  getAccountBlobServiceConfig,
  parseAccountModel
} from "../../src/common/account/AccountModel";
import { resolveAccountModel } from "../../src/common/EnvironmentFunctions";

describe("AccountModel @loki", () => {
  it("parses the full document shape", () => {
    const model = parseAccountModel(
      JSON.stringify({
        accounts: [
          {
            name: "devstoreaccount1",
            blobService: { isVersioningEnabled: true }
          },
          {
            name: "devstoreaccount2",
            blobService: { isVersioningEnabled: false }
          }
        ]
      }),
      "test"
    );

    assert.strictEqual(model.accounts.length, 2);
    assert.strictEqual(
      model.accounts[0].blobService.isVersioningEnabled,
      true
    );
    assert.strictEqual(
      model.accounts[1].blobService.isVersioningEnabled,
      false
    );
  });

  it("parses the single account shorthand", () => {
    const model = parseAccountModel(
      JSON.stringify({
        name: "devstoreaccount1",
        blobService: { isVersioningEnabled: true }
      }),
      "test"
    );

    assert.strictEqual(model.accounts.length, 1);
    assert.strictEqual(model.accounts[0].name, "devstoreaccount1");
    assert.strictEqual(model.accounts[0].blobService.isVersioningEnabled, true);
  });

  it("normalizes account names to lower case", () => {
    const model = parseAccountModel(
      JSON.stringify({ name: "DevStoreAccount1" }),
      "test"
    );
    assert.strictEqual(model.accounts[0].name, "devstoreaccount1");
  });

  it("defaults versioning to disabled when blobService is omitted", () => {
    const model = parseAccountModel(
      JSON.stringify({ name: "devstoreaccount1" }),
      "test"
    );
    assert.strictEqual(model.accounts[0].blobService.isVersioningEnabled, false);
  });

  it("rejects malformed JSON", () => {
    assert.throws(
      () => parseAccountModel("{not json", "test"),
      AccountConfigError
    );
  });

  it("rejects an empty accounts array", () => {
    assert.throws(
      () => parseAccountModel(JSON.stringify({ accounts: [] }), "test"),
      AccountConfigError
    );
  });

  it("rejects an account without a name", () => {
    assert.throws(
      () =>
        parseAccountModel(
          JSON.stringify({ accounts: [{ blobService: {} }] }),
          "test"
        ),
      AccountConfigError
    );
  });

  it("rejects duplicate account names", () => {
    assert.throws(
      () =>
        parseAccountModel(
          JSON.stringify({
            accounts: [{ name: "a" }, { name: "A" }]
          }),
          "test"
        ),
      AccountConfigError
    );
  });

  it("rejects a non-boolean isVersioningEnabled", () => {
    assert.throws(
      () =>
        parseAccountModel(
          JSON.stringify({
            name: "a",
            blobService: { isVersioningEnabled: "yes" }
          }),
          "test"
        ),
      AccountConfigError
    );
  });

  it("falls back to defaults for unconfigured accounts", () => {
    const model = parseAccountModel(
      JSON.stringify({ name: "a", blobService: { isVersioningEnabled: true } }),
      "test"
    );

    assert.strictEqual(
      getAccountBlobServiceConfig(model, "a").isVersioningEnabled,
      true
    );
    assert.strictEqual(
      getAccountBlobServiceConfig(model, "A").isVersioningEnabled,
      true
    );
    assert.strictEqual(
      getAccountBlobServiceConfig(model, "other").isVersioningEnabled,
      false
    );
    assert.strictEqual(
      getAccountBlobServiceConfig(undefined, "a").isVersioningEnabled,
      false
    );
  });

  it("rejects supplying both --accountConfigFile and --accountConfig", async () => {
    await assert.rejects(
      () => resolveAccountModel("some/path.json", "{}"),
      AccountConfigError
    );
  });

  it("returns undefined when neither option is supplied", async () => {
    assert.strictEqual(await resolveAccountModel(undefined, undefined), undefined);
  });

  it("reports an unreadable account configuration file", async () => {
    await assert.rejects(
      () => resolveAccountModel("does/not/exist.json", undefined),
      AccountConfigError
    );
  });
});
