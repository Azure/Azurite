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
const { uploadBlobFixture } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "blobUploader")
);
const { toCreateEntityPayload } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "tableValueCodec")
);
const { waitForHttpUp, waitForHttpDown } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "httpProbe")
);
const { waitForDirectoryStable } = require(
  require("path").join(DIST_TESTS_UPGRADE, "utils", "fileStability")
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
    // Isolated test profile only - keeps this run out of real usage telemetry.
    await vscode.workspace
      .getConfiguration("azurite")
      .update("disableTelemetry", true, vscode.ConfigurationTarget.Global);

    // The installed SDK clients (@azure/storage-*) may send a newer x-ms-version
    // than an older published extension supports - mirrors --skipApiVersionCheck
    // passed to the npm/Docker upgrade targets in upgradeTarget.ts/dockerHarness.ts.
    await vscode.workspace
      .getConfiguration("azurite")
      .update("skipApiVersionCheck", true, vscode.ConfigurationTarget.Global);

    // Point the extension at the free ports runVsixUpgradeTest.ts allocated for
    // this run instead of the well-known defaults - see upgradeTestUtils.js.
    const azuriteConfig = vscode.workspace.getConfiguration("azurite");
    await azuriteConfig.update(
      "blobPort",
      BLOB_PORT,
      vscode.ConfigurationTarget.Global
    );
    await azuriteConfig.update(
      "queuePort",
      QUEUE_PORT,
      vscode.ConfigurationTarget.Global
    );
    await azuriteConfig.update(
      "tablePort",
      TABLE_PORT,
      vscode.ConfigurationTarget.Global
    );

    // This phase runs the already-published Marketplace extension, which may
    // predate the local build's fix making azurite.start await all three
    // server managers before resolving - wait for all three ports explicitly
    // rather than assuming the command's completion means they're up.
    //
    // Both the start/probe and the seeding below share one try/finally so a
    // probe timeout (e.g. only blob/queue came up) still runs azurite.close -
    // otherwise a partially-started server is left running and orphaned.
    try {
      await vscode.commands.executeCommand("azurite.start");
      await Promise.all([
        waitForHttpUp(BLOB_PORT),
        waitForHttpUp(QUEUE_PORT),
        waitForHttpUp(TABLE_PORT)
      ]);

      const blobServiceClient = new BlobServiceClient(
        `http://127.0.0.1:${BLOB_PORT}/${EMULATOR_ACCOUNT_NAME}`,
        new StorageSharedKeyCredential(
          EMULATOR_ACCOUNT_NAME,
          EMULATOR_ACCOUNT_KEY
        )
      );
      const containerClient =
        blobServiceClient.getContainerClient(CONTAINER_NAME);
      await containerClient.create();
      for (const fixture of buildBlobFixtures()) {
        await uploadBlobFixture(containerClient, fixture);
      }

      const queueFixture = buildQueueFixtures(FIXTURE_SUFFIX);
      const queueClient = new QueueClient(
        `http://127.0.0.1:${QUEUE_PORT}/${EMULATOR_ACCOUNT_NAME}/${queueFixture.queueName}`,
        new QueueStorageSharedKeyCredential(
          EMULATOR_ACCOUNT_NAME,
          EMULATOR_ACCOUNT_KEY
        )
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
        new AzureNamedKeyCredential(
          EMULATOR_ACCOUNT_NAME,
          EMULATOR_ACCOUNT_KEY
        ),
        { allowInsecureConnection: true }
      );
      await tableClient.createTable();
      for (const entity of entities) {
        await tableClient.createEntity(toCreateEntityPayload(entity));
      }
    } finally {
      await vscode.commands.executeCommand("azurite.close");
      // A port going down is NOT proof persistence finished: ServerBase.close()
      // stops the HTTP listener before afterClose() closes the metadata/extent
      // stores (src/common/ServerBase.ts), and the published Marketplace vsix
      // this phase runs may not even await its close command's promise. Wait
      // for the whole workspace directory to go quiet instead of watching
      // specific metadata/extent filenames - this phase runs the published
      // VSIX, and hardcoding today's local-build filenames would silently
      // stop covering a future release that renames one (even with migration
      // support for the old name). The verify phase starts a brand-new VS
      // Code process against this same on-disk workspace, so if this session
      // ends (and gets torn down) mid-flush, the seeded data can be lost or
      // corrupted before verify ever reads it.
      const workspaceDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
      await Promise.all([
        waitForHttpDown(BLOB_PORT),
        waitForHttpDown(QUEUE_PORT),
        waitForHttpDown(TABLE_PORT)
      ]);
      await waitForDirectoryStable(workspaceDir);
    }
  });
});
