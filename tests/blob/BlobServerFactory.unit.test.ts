import * as assert from "assert";

import { BlobServerFactory } from "../../src/blob/BlobServerFactory";
import IBlobEnvironment from "../../src/blob/IBlobEnvironment";
import { AccountModel } from "../../src/common/account/AccountModel";
import LokiAccountModelStore from "../../src/common/account/LokiAccountModelStore";

describe("BlobServerFactory", () => {
  it("should reject versioning with SQL metadata", async () => {
    const originalDatabase = process.env.AZURITE_DB;
    process.env.AZURITE_DB = "mysql://unused";

    const account: AccountModel = {
      key: "devstoreaccount1",
      isBlobVersioningEnabled: true
    };
    const accountModelStore = new LokiAccountModelStore(
      "",
      true,
      new Map([[account.key, account]])
    );
    const environment: IBlobEnvironment = {
      blobHost: () => "127.0.0.1",
      blobPort: () => 10000,
      blobKeepAliveTimeout: () => 0,
      location: async () => ".",
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
      getAccountModels: () => new Map([[account.key, account]])
    };

    try {
      await assert.rejects(
        () =>
          new BlobServerFactory().createServer(
            environment,
            accountModelStore
          ),
        /Blob versioning is not supported when using SQL-based metadata storage/
      );
    } finally {
      if (originalDatabase === undefined) {
        delete process.env.AZURITE_DB;
      } else {
        process.env.AZURITE_DB = originalDatabase;
      }
    }
  });
});
