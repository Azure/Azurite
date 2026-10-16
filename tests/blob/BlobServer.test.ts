import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import BlobConfiguration from "../../src/blob/BlobConfiguration";
import BlobServer from "../../src/blob/BlobServer";
import {
  DEFAULT_ACCOUNT_MODEL_LOKI_DB_PATH,
  DEFAULT_BLOB_EXTENT_LOKI_DB_PATH,
  DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
  DEFAULT_BLOB_LOKI_DB_PATH,
  DEFAULT_BLOB_PERSISTENCE_PATH
} from "../../src/blob/utils/constants";
import { AccountModel } from "../../src/common/account/AccountModel";
import IAccountModelStore from "../../src/common/account/IAccountModelStore";
import LokiAccountModelStore from "../../src/common/account/LokiAccountModelStore";
import logger, { configLogger } from "../../src/common/Logger";
import ILoggerStrategy, { LogLevels } from "../../src/common/ILoggerStrategy";
import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } from "../testutils";

// Set true to enable debug log
configLogger(false);

const FALLBACK_LOG = "No account model store provided";

function versioningEnabledFor(accountName: string): Map<string, AccountModel> {
  return new Map([
    [accountName, { key: accountName, isBlobVersioningEnabled: true }]
  ]);
}

describe("BlobServer account model store @loki", () => {
  let location: string;
  let accountModelPath: string;
  let infoLogs: string[];
  let originalStrategy: ILoggerStrategy;

  function createConfiguration(
    accountModelStore?: IAccountModelStore
  ): BlobConfiguration {
    return new BlobConfiguration(
      "127.0.0.1",
      0,
      DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
      join(location, DEFAULT_BLOB_LOKI_DB_PATH),
      join(location, DEFAULT_BLOB_EXTENT_LOKI_DB_PATH),
      [
        {
          locationId: "test",
          locationPath: join(location, DEFAULT_BLOB_PERSISTENCE_PATH),
          maxConcurrency: 10
        }
      ],
      false,
      undefined,
      false,
      undefined,
      false,
      false,
      "",
      "",
      "",
      undefined,
      false,
      false,
      undefined,
      accountModelStore
    );
  }

  /**
   * Starts the server, uploads the same blob twice and returns both version IDs.
   */
  async function uploadTwice(
    server: BlobServer
  ): Promise<Array<string | undefined>> {
    await server.start();
    const serviceClient = new BlobServiceClient(
      `${server.getHttpServerAddress()}/${EMULATOR_ACCOUNT_NAME}`,
      newPipeline(
        new StorageSharedKeyCredential(
          EMULATOR_ACCOUNT_NAME,
          EMULATOR_ACCOUNT_KEY
        ),
        { retryOptions: { maxTries: 1 }, keepAliveOptions: { enable: false } }
      )
    );
    const containerClient = serviceClient.getContainerClient("container");
    await containerClient.create();
    const blobClient = containerClient.getBlockBlobClient("blob");

    const first = await blobClient.upload("first", 5);
    const second = await blobClient.upload("second", 6);
    return [first.versionId, second.versionId];
  }

  beforeEach(() => {
    location = mkdtempSync(join(tmpdir(), "azurite-blobserver-"));
    accountModelPath = join(location, DEFAULT_ACCOUNT_MODEL_LOKI_DB_PATH);

    infoLogs = [];
    originalStrategy = logger.strategy;
    logger.strategy = {
      log: (level: LogLevels, message: string) => {
        if (level === LogLevels.Info) {
          infoLogs.push(message);
        }
      }
    };
  });

  afterEach(() => {
    logger.strategy = originalStrategy;
    rmSync(location, { recursive: true, force: true });
  });

  it("should start without an account model store and keep versioning disabled @loki", async () => {
    const server = new BlobServer(createConfiguration());

    try {
      const versionIds = await uploadTwice(server);
      assert.deepStrictEqual(versionIds, [undefined, undefined]);
    } finally {
      await server.close();
    }

    assert.ok(
      infoLogs.some(
        (message) =>
          message.includes(FALLBACK_LOG) && message.includes(accountModelPath)
      ),
      `Expected a fallback log for ${accountModelPath}, got: ${JSON.stringify(
        infoLogs
      )}`
    );
    assert.strictEqual(existsSync(accountModelPath), false);
  });

  it("should use a persisted setting at the default path when no store is provided @loki", async () => {
    const persistedStore = new LokiAccountModelStore(
      accountModelPath,
      false,
      versioningEnabledFor(EMULATOR_ACCOUNT_NAME)
    );
    await persistedStore.init();
    await persistedStore.close();

    const server = new BlobServer(createConfiguration());

    try {
      const [first, second] = await uploadTwice(server);
      assert.ok(first);
      assert.ok(second);
      assert.notStrictEqual(first, second);
    } finally {
      await server.close();
    }

    assert.ok(infoLogs.some((message) => message.includes(FALLBACK_LOG)));
  });

  it("should start with an account model store that has no settings @loki", async () => {
    const server = new BlobServer(
      createConfiguration(new LokiAccountModelStore(accountModelPath, false))
    );

    try {
      const versionIds = await uploadTwice(server);
      assert.deepStrictEqual(versionIds, [undefined, undefined]);
    } finally {
      await server.close();
    }

    assert.ok(!infoLogs.some((message) => message.includes(FALLBACK_LOG)));
    assert.strictEqual(existsSync(accountModelPath), false);
  });

  it("should start with an account model store that enables versioning @loki", async () => {
    const server = new BlobServer(
      createConfiguration(
        new LokiAccountModelStore(
          accountModelPath,
          false,
          versioningEnabledFor(EMULATOR_ACCOUNT_NAME)
        )
      )
    );

    try {
      const [first, second] = await uploadTwice(server);
      assert.ok(first);
      assert.ok(second);
      assert.notStrictEqual(first, second);
    } finally {
      await server.close();
    }

    assert.ok(!infoLogs.some((message) => message.includes(FALLBACK_LOG)));
    assert.strictEqual(existsSync(accountModelPath), true);
  });
});
