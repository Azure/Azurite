const assert = require("assert");
const vscode = require("vscode");
const {
  BlobServiceClient,
  StorageSharedKeyCredential
} = require("@azure/storage-blob");
const {
  QueueClient,
  StorageSharedKeyCredential: QueueStorageSharedKeyCredential
} = require("@azure/storage-queue");
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
const { waitForHttpUp, waitForHttpDown } = require(
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
    // Isolated test profile only - keeps this run out of real usage telemetry.
    await vscode.workspace
      .getConfiguration("azurite")
      .update("disableTelemetry", true, vscode.ConfigurationTarget.Global);

    // Point the extension at the same free ports the seed phase used - see
    // upgradeTestUtils.js.
    const azuriteConfig = vscode.workspace.getConfiguration("azurite");
    await azuriteConfig.update("blobPort", BLOB_PORT, vscode.ConfigurationTarget.Global);
    await azuriteConfig.update("queuePort", QUEUE_PORT, vscode.ConfigurationTarget.Global);
    await azuriteConfig.update("tablePort", TABLE_PORT, vscode.ConfigurationTarget.Global);

    // azurite.start already awaits all three server managers before
    // resolving; these probes just confirm the ports are actually reachable
    // before touching any fixture.
    //
    // Both the start/probe and the verification below share one try/finally
    // so a probe timeout (e.g. only blob/queue came up) still runs
    // azurite.close - otherwise a partially-started server is left running.
    try {
      await vscode.commands.executeCommand("azurite.start");
      await Promise.all([
        waitForHttpUp(BLOB_PORT),
        waitForHttpUp(QUEUE_PORT),
        waitForHttpUp(TABLE_PORT)
      ]);

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
        new QueueStorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
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
        // disableTypeConversion: true makes assertEntityMatchesFixture's EDM
        // type assertions meaningful - without it, a dropped @odata.type
        // annotation would silently collapse to a same-looking plain value.
        const fetched = await tableClient.getEntity(entity.partitionKey, entity.rowKey, {
          disableTypeConversion: true
        });
        assertEntityMatchesFixture(fetched, entity);
      }
    } finally {
      await vscode.commands.executeCommand("azurite.close");
      // Mirrors seed.test.js - confirms the local build's close actually
      // stops the listeners rather than assuming the command's completion means it did.
      await Promise.all([
        waitForHttpDown(BLOB_PORT),
        waitForHttpDown(QUEUE_PORT),
        waitForHttpDown(TABLE_PORT)
      ]);
    }
  });
});
