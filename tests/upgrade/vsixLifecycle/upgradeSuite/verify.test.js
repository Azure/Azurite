const assert = require("assert");
const vscode = require("vscode");
const {
  BlobServiceClient,
  StorageSharedKeyCredential
} = require("@azure/storage-blob");
const { QueueClient } = require("@azure/storage-queue");
const { AzureNamedKeyCredential, TableClient } = require("@azure/data-tables");

const {
  DIST_TESTS_UPGRADE,
  BLOB_PORT,
  QUEUE_PORT,
  TABLE_PORT,
  CONTAINER_NAME,
  FIXTURE_SUFFIX
} = require("./upgradeTestUtils");

const { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } = require(
  require("path").join(DIST_TESTS_UPGRADE, "..", "testutils")
);
const {
  buildBlobFixtures,
  buildQueueFixtures,
  buildTableEntityFixtures
} = require(require("path").join(DIST_TESTS_UPGRADE, "utils", "dataFixtures"));
const { assertBlobFixtureSurvived } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "blobUploader")
);
const { assertEntityMatchesFixture } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "tableValueCodec")
);
const { waitForHttpUp } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "httpProbe")
);

/**
 * Phase 2 of the VSIX upgrade test: runs inside a VS Code instance with the
 * **local (unreleased) build** packaged as a .vsix, pointed at the same
 * on-disk workspace the seed phase wrote to. Starts the emulator and asserts
 * every blob/queue/table fixture seeded by the published Marketplace version
 * survived the upgrade.
 */
describe("Azurite VSIX upgrade - verify with local build", function () {
  this.timeout(120000);

  it("starts the local extension and reads back the seeded blob/queue/table data", async () => {
    // As in the seed phase, azurite.start resolves before its async server
    // managers finish starting - wait for all three listeners explicitly.
    await vscode.commands.executeCommand("azurite.start");
    await Promise.all([
      waitForHttpUp(BLOB_PORT),
      waitForHttpUp(QUEUE_PORT),
      waitForHttpUp(TABLE_PORT)
    ]);

    try {
      const blobServiceClient = new BlobServiceClient(
        `http://127.0.0.1:${BLOB_PORT}/${EMULATOR_ACCOUNT_NAME}`,
        new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
      );
      const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
      for (const fixture of buildBlobFixtures()) {
        await assertBlobFixtureSurvived(containerClient, fixture);
      }

      const queueFixture = buildQueueFixtures(FIXTURE_SUFFIX);
      const queueClient = new QueueClient(
        `http://127.0.0.1:${QUEUE_PORT}/${EMULATOR_ACCOUNT_NAME}/${queueFixture.queueName}`,
        new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
      );
      const properties = await queueClient.getProperties();
      assert.strictEqual(
        properties.approximateMessagesCount,
        queueFixture.messages.length,
        "Queue message count did not survive the VSIX upgrade"
      );
      const received = await queueClient.receiveMessages({
        numberOfMessages: queueFixture.messages.length
      });
      const receivedTexts = received.receivedMessageItems
        .map((m) => m.messageText)
        .sort();
      const expectedTexts = [...queueFixture.messages].sort();
      assert.deepStrictEqual(
        receivedTexts,
        expectedTexts,
        "Dequeued message content did not match what was enqueued before the VSIX upgrade"
      );

      const { tableName, entities } = buildTableEntityFixtures(
        `vsixupgradetable`,
        FIXTURE_SUFFIX
      );
      const tableClient = new TableClient(
        `http://127.0.0.1:${TABLE_PORT}/${EMULATOR_ACCOUNT_NAME}`,
        tableName,
        new AzureNamedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
        { allowInsecureConnection: true }
      );
      for (const entity of entities) {
        const fetched = await tableClient.getEntity(entity.partitionKey, entity.rowKey);
        assertEntityMatchesFixture(fetched, entity);
      }
    } finally {
      await vscode.commands.executeCommand("azurite.close");
    }
  });
});
