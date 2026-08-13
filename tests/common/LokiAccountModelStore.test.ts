import * as assert from "assert";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import LokiAccountModelStore from "../../src/common/account/LokiAccountModelStore";
import { AccountModel } from "../../src/common/account/AccountModel";

describe("LokiAccountModelStore", () => {
  let store: LokiAccountModelStore;
  let dbPath: string;

  beforeEach(() => {
    // Create a unique temporary database file for each test
    dbPath = join(tmpdir(), `test-account-model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
  });

  afterEach(async () => {
    // Clean up
    if (store && !store.isClosed()) {
      await store.close();
    }
    try {
      unlinkSync(dbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("should create store with file persistence", () => {
      store = new LokiAccountModelStore(dbPath, false);
      assert.ok(store);
      assert.strictEqual(store.lokiDBPath, dbPath);
    });

    it("should create store with in-memory persistence", () => {
      store = new LokiAccountModelStore(dbPath, true);
      assert.ok(store);
      assert.strictEqual(store.lokiDBPath, dbPath);
    });

    it("should create store with account models from args", () => {
      const accountModels = new Map<string, AccountModel>();
      accountModels.set("account1", { key: "account1", isBlobVersioningEnabled: true });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels);
      assert.ok(store);
    });
  });

  describe("init", () => {
    it("should initialize empty store successfully", async () => {
      store = new LokiAccountModelStore(dbPath, false);
      
      assert.strictEqual(store.isInitialized(), false);
      assert.strictEqual(store.isClosed(), true);
      
      await store.init();
      
      assert.strictEqual(store.isInitialized(), true);
      assert.strictEqual(store.isClosed(), false);
    });

    it("should initialize store with account models from args", async () => {
      const accountModels = new Map<string, AccountModel>();
      accountModels.set("account1", { key: "account1", isBlobVersioningEnabled: true });
      accountModels.set("account2", { key: "account2", isBlobVersioningEnabled: false });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels);
      await store.init();
      
      assert.strictEqual(store.isInitialized(), true);
      
      const account1 = store.getAccountModel("account1");
      assert.ok(account1);
      assert.strictEqual(account1.key, "account1");
      assert.strictEqual(account1.isBlobVersioningEnabled, true);
      
      const account2 = store.getAccountModel("account2");
      assert.ok(account2);
      assert.strictEqual(account2.key, "account2");
      assert.strictEqual(account2.isBlobVersioningEnabled, false);
    });

    it("should merge account models from args with existing DB", async () => {
      // First initialization with one account
      const accountModels1 = new Map<string, AccountModel>();
      accountModels1.set("account1", { key: "account1", isBlobVersioningEnabled: true });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels1);
      await store.init();
      await store.close();
      
      // Second initialization with updated configuration
      const accountModels2 = new Map<string, AccountModel>();
      accountModels2.set("account1", { key: "account1", isBlobVersioningEnabled: false });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels2);
      await store.init();
      
      const account1 = store.getAccountModel("account1");
      assert.ok(account1);
      assert.strictEqual(account1.isBlobVersioningEnabled, false);
    });

    it("should preserve existing accounts when adding new ones", async () => {
      // First initialization with one account
      const accountModels1 = new Map<string, AccountModel>();
      accountModels1.set("account1", { key: "account1", isBlobVersioningEnabled: true });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels1);
      await store.init();
      await store.close();
      
      // Second initialization with a different account
      const accountModels2 = new Map<string, AccountModel>();
      accountModels2.set("account2", { key: "account2", isBlobVersioningEnabled: false });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels2);
      await store.init();
      
      // Both accounts should exist
      const account1 = store.getAccountModel("account1");
      assert.ok(account1);
      assert.strictEqual(account1.isBlobVersioningEnabled, true);
      
      const account2 = store.getAccountModel("account2");
      assert.ok(account2);
      assert.strictEqual(account2.isBlobVersioningEnabled, false);
    });
  });

  describe("getAccountModel", () => {
    beforeEach(async () => {
      const accountModels = new Map<string, AccountModel>();
      accountModels.set("account1", { key: "account1", isBlobVersioningEnabled: true });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels);
      await store.init();
    });

    it("should return account model for existing account", () => {
      const account = store.getAccountModel("account1");
      
      assert.ok(account);
      assert.strictEqual(account.key, "account1");
      assert.strictEqual(account.isBlobVersioningEnabled, true);
    });

    it("should resolve account names case-insensitively", () => {
      const account = store.getAccountModel("ACCOUNT1");

      assert.ok(account);
      assert.strictEqual(account.key, "account1");
    });

    it("should return undefined for non-existent account", () => {
      const account = store.getAccountModel("nonexistent");
      
      assert.strictEqual(account, undefined);
    });

    it("should throw error if store is not initialized", () => {
      store = new LokiAccountModelStore(dbPath, false);
      
      assert.throws(
        () => store.getAccountModel("account1"),
        /Account model collection is not initialized/
      );
    });
  });

  describe("isBlobVersioningEnabled", () => {
    beforeEach(async () => {
      const accountModels = new Map<string, AccountModel>();
      accountModels.set("versioned", { key: "versioned", isBlobVersioningEnabled: true });
      accountModels.set("notversioned", { key: "notversioned", isBlobVersioningEnabled: false });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels);
      await store.init();
    });

    it("should return true for account with versioning enabled", () => {
      assert.strictEqual(store.isBlobVersioningEnabled("versioned"), true);
    });

    it("should return false for account with versioning disabled", () => {
      assert.strictEqual(store.isBlobVersioningEnabled("notversioned"), false);
    });

    it("should return false for non-existent account", () => {
      assert.strictEqual(store.isBlobVersioningEnabled("nonexistent"), false);
    });
  });

  describe("close", () => {
    it("should close successfully", async () => {
      store = new LokiAccountModelStore(dbPath, false);
      await store.init();
      
      assert.strictEqual(store.isClosed(), false);
      
      await store.close();
      
      assert.strictEqual(store.isClosed(), true);
    });

    it("should remove its persisted database when cleaned", async () => {
      store = new LokiAccountModelStore(dbPath, false);
      await store.init();
      await store.close();

      assert.strictEqual(existsSync(dbPath), true);
      await store.clean();
      assert.strictEqual(existsSync(dbPath), false);
    });
  });

  describe("multiple accounts scenario", () => {
    it("should handle multiple accounts with different configurations", async () => {
      const accountModels = new Map<string, AccountModel>();
      accountModels.set("devstoreaccount1", { key: "devstoreaccount1", isBlobVersioningEnabled: false });
      accountModels.set("testaccount1", { key: "testaccount1", isBlobVersioningEnabled: true });
      accountModels.set("prodaccount1", { key: "prodaccount1", isBlobVersioningEnabled: true });
      
      store = new LokiAccountModelStore(dbPath, false, accountModels);
      await store.init();
      
      assert.strictEqual(store.isBlobVersioningEnabled("devstoreaccount1"), false);
      assert.strictEqual(store.isBlobVersioningEnabled("testaccount1"), true);
      assert.strictEqual(store.isBlobVersioningEnabled("prodaccount1"), true);
      
      // Verify persistence
      await store.close();
      
      store = new LokiAccountModelStore(dbPath, false);
      await store.init();
      
      assert.strictEqual(store.isBlobVersioningEnabled("devstoreaccount1"), false);
      assert.strictEqual(store.isBlobVersioningEnabled("testaccount1"), true);
      assert.strictEqual(store.isBlobVersioningEnabled("prodaccount1"), true);
    });
  });

  describe("in-memory persistence", () => {
    it("should not persist data with in-memory mode", async () => {
      const accountModels = new Map<string, AccountModel>();
      accountModels.set("account1", { key: "account1", isBlobVersioningEnabled: true });
      
      store = new LokiAccountModelStore(dbPath, true, accountModels);
      await store.init();
      
      assert.strictEqual(store.isBlobVersioningEnabled("account1"), true);
      
      await store.close();
      
      // Reopen - should not have the data
      store = new LokiAccountModelStore(dbPath, true);
      await store.init();
      
      assert.strictEqual(store.isBlobVersioningEnabled("account1"), false);
    });
  });
});
