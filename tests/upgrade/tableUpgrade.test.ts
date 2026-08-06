import * as assert from "assert";
import { AzureNamedKeyCredential, TableClient } from "@azure/data-tables";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } from "../testutils";
import { buildTableEntityFixtures } from "./utils/dataFixtures";
import { installNpmVersion } from "./utils/npmVersionInstaller";
import {
  assertEntityMatchesFixture,
  toCreateEntityPayload
} from "./utils/tableValueCodec";
import { NpmProcessTarget } from "./utils/upgradeTarget";
import { getLatestPublishedNpmVersion } from "./utils/versionResolver";

// This suite requires network access (npm registry) and a local production
// build (`npm run build`). Run via `npm run test:upgrade`.

const BLOB_PORT = 12200;
const QUEUE_PORT = 12201;
const TABLE_PORT = 12202;

const LOCAL_ENTRY_POINT = join(
  __dirname,
  "..",
  "..",
  "dist",
  "src",
  "azurite.js"
);

function throwOnMissingLocalBuild() {
  if (!existsSync(LOCAL_ENTRY_POINT)) {
    throw new Error(
      `Local build not found at ${LOCAL_ENTRY_POINT}. Run 'npm run build' first.`
    );
  }
}

function makeTableClient(tableName: string): TableClient {
  const credential = new AzureNamedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );
  return new TableClient(
    `http://127.0.0.1:${TABLE_PORT}/${EMULATOR_ACCOUNT_NAME}`,
    tableName,
    credential,
    { allowInsecureConnection: true }
  );
}

describe("Table upgrade compatibility @upgrade", function () {
  this.timeout(10 * 60 * 1000);

  const dataLocation = mkdtempSync(join(tmpdir(), "azurite-upgrade-table-"));
  const { tableName, entities } = buildTableEntityFixtures(
    "upgradetable",
    "1"
  );

  let oldVersionEntryPoint: string;
  let oldInstallDir: string | undefined;

  before(async function () {
    throwOnMissingLocalBuild();
    const version = await getLatestPublishedNpmVersion();
    const installed = installNpmVersion(version);
    oldVersionEntryPoint = installed.entryPoint;
    oldInstallDir = installed.installDir;
  });

  after(function () {
    rmSync(dataLocation, { recursive: true, force: true });
    if (oldInstallDir) {
      rmSync(oldInstallDir, { recursive: true, force: true });
    }
  });

  const ports = { blobPort: BLOB_PORT, queuePort: QUEUE_PORT, tablePort: TABLE_PORT };

  it("survives an upgrade: entities created with the latest published version are readable and unchanged after upgrading to the local build", async function () {
    // 1. Start the OLD (latest published) version and create entities.
    const oldTarget = new NpmProcessTarget(oldVersionEntryPoint, dataLocation, ports);
    await oldTarget.start();

    try {
      const tableClient = makeTableClient(tableName);
      await tableClient.createTable();

      for (const entity of entities) {
        await tableClient.createEntity(toCreateEntityPayload(entity));
      }
    } finally {
      await oldTarget.stop();
    }

    // 2. Start the LOCAL (new / unreleased) build against the SAME data location.
    const newTarget = new NpmProcessTarget(LOCAL_ENTRY_POINT, dataLocation, ports);
    await newTarget.start();

    try {
      const tableClient = makeTableClient(tableName);

      for (const entity of entities) {
        const fetched = await tableClient.getEntity(
          entity.partitionKey,
          entity.rowKey
        );

        assertEntityMatchesFixture(fetched, entity);
      }

      // Confirm the entity set as a whole (partition) survived too.
      const iterator = tableClient.listEntities({
        queryOptions: {
          filter: `PartitionKey eq '${entities[0].partitionKey}'`
        }
      });
      const listed: unknown[] = [];
      for await (const entity of iterator) {
        listed.push(entity);
      }
      assert.strictEqual(
        listed.length,
        entities.length,
        "Entity count in partition did not survive the upgrade"
      );
    } finally {
      await newTarget.stop();
    }
  });
});
