import * as assert from "assert";
import { existsSync, mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { BlobServerFactory } from "../../src/blob/BlobServerFactory";
import IBlobEnvironment from "../../src/blob/IBlobEnvironment";
import {
  DEFAULT_ACCOUNT_MODEL_LOKI_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_ARRAY
} from "../../src/blob/utils/constants";
import { AccountModel } from "../../src/common/account/AccountModel";
import LokiAccountModelStore from "../../src/common/account/LokiAccountModelStore";

function createEnvironment(
  location: string,
  accountModels?: Map<string, AccountModel>
): IBlobEnvironment {
  return {
    blobHost: () => "127.0.0.1",
    blobPort: () => 10000,
    blobKeepAliveTimeout: () => 0,
    location: async () => location,
    silent: () => true,
    loose: () => false,
    skipApiVersionCheck: () => false,
    cert: () => undefined,
    key: () => undefined,
    pwd: () => undefined,
    debug: async () => undefined,
    oauth: () => undefined,
    disableProductStyleUrl: () => false,
    inMemoryPersistence: () => false,
    extentMemoryLimit: () => undefined,
    disableTelemetry: () => true,
    getAccountModels: () => accountModels
  };
}

describe("BlobServerFactory", () => {
  const versioningEnabled: AccountModel = {
    key: "devstoreaccount1",
    isBlobVersioningEnabled: true
  };
  let originalDatabase: string | undefined;
  let originalPersistencePath: string;
  let location: string;
  let accountModelPath: string;

  beforeEach(() => {
    originalDatabase = process.env.AZURITE_DB;
    originalPersistencePath = DEFAULT_BLOB_PERSISTENCE_ARRAY[0].locationPath;
    process.env.AZURITE_DB = "mysql://unused";
    location = mkdtempSync(join(tmpdir(), "azurite-factory-"));
    accountModelPath = join(location, DEFAULT_ACCOUNT_MODEL_LOKI_DB_PATH);
  });

  afterEach(() => {
    if (originalDatabase === undefined) {
      delete process.env.AZURITE_DB;
    } else {
      process.env.AZURITE_DB = originalDatabase;
    }
    DEFAULT_BLOB_PERSISTENCE_ARRAY[0].locationPath = originalPersistencePath;
    rmSync(location, { recursive: true, force: true });
  });

  it("should reject versioning with SQL metadata", async () => {
    const accountModels = new Map([[versioningEnabled.key, versioningEnabled]]);
    const accountModelStore = new LokiAccountModelStore(
      accountModelPath,
      false,
      accountModels
    );

    await assert.rejects(
      () =>
        new BlobServerFactory().createServer(
          createEnvironment(location, accountModels),
          accountModelStore
        ),
      /Blob versioning is not supported when using SQL-based metadata storage/
    );
    assert.strictEqual(existsSync(accountModelPath), false);
  });

  it("should start with SQL metadata and warn when a persisted Loki setting enables versioning", async () => {
    const accountModels = new Map([[versioningEnabled.key, versioningEnabled]]);
    const lokiStore = new LokiAccountModelStore(accountModelPath, false, accountModels);
    await lokiStore.init();
    await lokiStore.close();
    const modifiedAt = statSync(accountModelPath).mtimeMs;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      const server = await new BlobServerFactory().createServer(
        createEnvironment(location),
        new LokiAccountModelStore(accountModelPath, false)
      );
      assert.ok(server);
    } finally {
      console.warn = originalWarn;
    }

    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /'devstoreaccount1'/);
    assert.match(warnings[0], /ignored with SQL-based metadata storage/);
    assert.strictEqual(statSync(accountModelPath).mtimeMs, modifiedAt);
  });

  it("should start with SQL metadata without creating an account model file", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      const server = await new BlobServerFactory().createServer(
        createEnvironment(location),
        new LokiAccountModelStore(accountModelPath, false)
      );
      assert.ok(server);
    } finally {
      console.warn = originalWarn;
    }

    assert.strictEqual(warnings.length, 0);
    assert.strictEqual(existsSync(accountModelPath), false);
  });
});
