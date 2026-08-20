import * as assert from "assert";
import { existsSync } from "fs";

import { AccountConfigError } from "../../src/common/account/AccountModel";
import LokiAccountModelStore from "../../src/common/account/LokiAccountModelStore";

describe("LokiAccountModelStore @loki", () => {
  const dbPath = "__test_db_account_unit__.json";

  async function openStore(
    accounts: { name: string; isVersioningEnabled: boolean }[] = [],
    inMemory: boolean = false
  ) {
    const store = new LokiAccountModelStore(
      dbPath,
      inMemory,
      accounts.map((a) => ({
        name: a.name,
        blobService: { isVersioningEnabled: a.isVersioningEnabled }
      }))
    );
    await store.init();
    return store;
  }

  afterEach(async () => {
    if (existsSync(dbPath)) {
      const store = new LokiAccountModelStore(dbPath, false);
      await store.init();
      await store.close();
      await store.clean();
    }
  });

  it("defaults to versioning disabled for an unconfigured account", async () => {
    const store = await openStore();
    assert.strictEqual(
      store.getBlobServiceConfig("devstoreaccount1").isVersioningEnabled,
      false
    );
    await store.close();
  });

  it("applies the configuration supplied at start up", async () => {
    const store = await openStore([
      { name: "acct1", isVersioningEnabled: true },
      { name: "acct2", isVersioningEnabled: false }
    ]);
    assert.strictEqual(store.getBlobServiceConfig("acct1").isVersioningEnabled, true);
    assert.strictEqual(store.getBlobServiceConfig("acct2").isVersioningEnabled, false);
    // Unlisted accounts keep the defaults, so configuration only ever opts accounts in
    assert.strictEqual(store.getBlobServiceConfig("acct3").isVersioningEnabled, false);
    await store.close();
  });

  it("matches account names case insensitively", async () => {
    const store = await openStore([{ name: "acct1", isVersioningEnabled: true }]);
    assert.strictEqual(store.getBlobServiceConfig("ACCT1").isVersioningEnabled, true);
    await store.close();
  });

  it("persists configuration across runs when none is supplied", async () => {
    let store = await openStore([{ name: "acct1", isVersioningEnabled: true }]);
    await store.close();

    // A later run without any account options keeps the previous configuration, the way
    // the ARM setting persists on a real account until it is changed.
    store = await openStore();
    assert.strictEqual(store.getBlobServiceConfig("acct1").isVersioningEnabled, true);
    await store.close();
  });

  it("allows a persisted setting to be changed", async () => {
    let store = await openStore([{ name: "acct1", isVersioningEnabled: true }]);
    await store.close();

    store = await openStore([{ name: "acct1", isVersioningEnabled: false }]);
    assert.strictEqual(store.getBlobServiceConfig("acct1").isVersioningEnabled, false);
    await store.close();

    // ...and the change is itself persisted
    store = await openStore();
    assert.strictEqual(store.getBlobServiceConfig("acct1").isVersioningEnabled, false);
    await store.close();
  });

  it("merges a new account into persisted configuration", async () => {
    let store = await openStore([{ name: "acct1", isVersioningEnabled: true }]);
    await store.close();

    store = await openStore([{ name: "acct2", isVersioningEnabled: true }]);
    assert.strictEqual(store.getBlobServiceConfig("acct1").isVersioningEnabled, true);
    assert.strictEqual(store.getBlobServiceConfig("acct2").isVersioningEnabled, true);
    assert.strictEqual(store.listConfigs().length, 2);
    await store.close();
  });

  it("reports the configuration in effect", async () => {
    const store = await openStore([{ name: "acct1", isVersioningEnabled: true }]);
    assert.deepStrictEqual(store.listConfigs(), [
      { name: "acct1", blobService: { isVersioningEnabled: true } }
    ]);
    await store.close();
  });

  it("tracks initialized and closed state", async () => {
    const store = new LokiAccountModelStore(dbPath, false);
    assert.strictEqual(store.isInitialized(), false);
    assert.strictEqual(store.isClosed(), true);
    await store.init();
    assert.strictEqual(store.isInitialized(), true);
    assert.strictEqual(store.isClosed(), false);
    await store.close();
    assert.strictEqual(store.isClosed(), true);
  });

  it("refuses to clean while open", async () => {
    const store = await openStore();
    await assert.rejects(() => store.clean(), /not closed/);
    await store.close();
  });

  it("writes no database file in memory mode", async () => {
    const memoryPath = "__test_db_account_memory__.json";
    const store = new LokiAccountModelStore(memoryPath, true, [
      { name: "acct1", blobService: { isVersioningEnabled: true } }
    ]);
    await store.init();
    assert.strictEqual(store.getBlobServiceConfig("acct1").isVersioningEnabled, true);
    assert.strictEqual(
      existsSync(memoryPath),
      false,
      "In memory persistence must not write a database file"
    );
    await store.close();
  });

  it("exposes AccountConfigError for callers to catch", () => {
    // The conflict path has no triggering setting today, so assert the contract the
    // callers depend on rather than a specific conflict.
    assert.ok(new AccountConfigError("x") instanceof Error);
  });
});
