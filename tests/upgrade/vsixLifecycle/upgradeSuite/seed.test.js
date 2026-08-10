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
const { uploadBlobFixture } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "blobUploader")
);
const { toCreateEntityPayload } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "tableValueCodec")
);
const { waitForHttpUp } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "httpProbe")
);

/**
 * Phase 1 of the VSIX upgrade test: runs inside a VS Code instance with the
 * latest **Marketplace-published** Azurite extension installed. Starts the
 * emulator via the real `azurite.start` command and seeds blob/queue/table
 * fixtures - the same fixtures the npm and Docker upgrade suites use - then
 * stops it, leaving the data on disk for the verify phase to pick up.
 */
describe("Azurite VSIX upgrade - seed with published Marketplace version", function () {
  this.timeout(120000);

  it("starts the published extension and seeds blob/queue/table data", async () => {
    // The installed SDK clients (@azure/storage-*) may send a newer x-ms-version
    // than an older published extension supports - mirrors --skipApiVersionCheck
    // passed to the npm/Docker upgrade targets in upgradeTarget.ts/dockerHarness.ts.
    await vscode.workspace
      .getConfiguration("azurite")
      .update("skipApiVersionCheck", true, vscode.ConfigurationTarget.Global);

    // azurite.start is fire-and-forget (src/extension.ts starts the three
    // server managers without awaiting them), so the command resolving
    // doesn't mean the listeners are up yet - wait for all three explicitly.
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
      await containerClient.create();
      for (const fixture of buildBlobFixtures()) {
        await uploadBlobFixture(containerClient, fixture);
      }

      const queueFixture = buildQueueFixtures(FIXTURE_SUFFIX);
      const queueClient = new QueueClient(
        `http://127.0.0.1:${QUEUE_PORT}/${EMULATOR_ACCOUNT_NAME}/${queueFixture.queueName}`,
        new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
      );
      await queueClient.create();
      for (const message of queueFixture.messages) {
        await queueClient.sendMessage(message);
      }

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
      await tableClient.createTable();
      for (const entity of entities) {
        await tableClient.createEntity(toCreateEntityPayload(entity));
      }
    } finally {
      await vscode.commands.executeCommand("azurite.close");
      // The published extension's azurite.close doesn't await the LokiJS
      // flush (a bug fixed locally but not retroactively in already-published
      // versions - see VSCServerManager{Blob,Queue,Table}.closeImpl), and the
      // metadata stores only autosave every 5s otherwise - so give the flush
      // a beat to land on disk before the Extension Host process tears down.
      await new Promise((resolve) => setTimeout(resolve, 6000));
    }
  });
});
