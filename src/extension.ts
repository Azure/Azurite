import { commands, ExtensionContext, StatusBarAlignment, window } from "vscode";

import VSCAccessLog from "./common/VSCAccessLog";
import VSCNotification from "./common/VSCNotification";
import VSCProgress from "./common/VSCProgress";
import VSCServerManagerBlob from "./common/VSCServerManagerBlob";
import VSCServerManagerDataLake from "./common/VSCServerManagerDataLake";
import VSCServerManagerQueue from "./common/VSCServerManagerQueue";
import VSCServerManagerTable from "./common/VSCServerManagerTable";
import VSCStatusBarItem from "./common/VSCStatusBarItem";

export function activate(context: ExtensionContext) {
  // Initialize server managers
  const blobServerManager = new VSCServerManagerBlob();
  const dataLakeServerManager = new VSCServerManagerDataLake();
  const queueServerManager = new VSCServerManagerQueue();
  const tableServerManager = new VSCServerManagerTable();

  // Hook up status bar handlers
  const vscBlobStatusBar = new VSCStatusBarItem(
    blobServerManager,
    window.createStatusBarItem(StatusBarAlignment.Right, 1000)
  );
  const vscQueueStatusBar = new VSCStatusBarItem(
    queueServerManager,
    window.createStatusBarItem(StatusBarAlignment.Right, 1001)
  );
  const vscTableStatusBar = new VSCStatusBarItem(
    tableServerManager,
    window.createStatusBarItem(StatusBarAlignment.Right, 1002)
  );
  const vscDataLakeStatusBar = new VSCStatusBarItem(
    dataLakeServerManager,
    window.createStatusBarItem(StatusBarAlignment.Right, 1003)
  );

  blobServerManager.addEventListener(vscBlobStatusBar);
  queueServerManager.addEventListener(vscQueueStatusBar);
  tableServerManager.addEventListener(vscTableStatusBar);
  dataLakeServerManager.addEventListener(vscDataLakeStatusBar);

  // Hook up notification handlers
  const notification = new VSCNotification();
  blobServerManager.addEventListener(notification);
  queueServerManager.addEventListener(notification);
  tableServerManager.addEventListener(notification);
  dataLakeServerManager.addEventListener(notification);

  // Hook up progress handlers
  blobServerManager.addEventListener(new VSCProgress());
  queueServerManager.addEventListener(new VSCProgress());
  tableServerManager.addEventListener(new VSCProgress());
  dataLakeServerManager.addEventListener(new VSCProgress());

  // Hook up access log handlers
  blobServerManager.addEventListener(
    new VSCAccessLog(blobServerManager.accessChannelStream)
  );
  queueServerManager.addEventListener(
    new VSCAccessLog(queueServerManager.accessChannelStream)
  );
  tableServerManager.addEventListener(
    new VSCAccessLog(tableServerManager.accessChannelStream)
  );
  dataLakeServerManager.addEventListener(
    new VSCAccessLog(dataLakeServerManager.accessChannelStream)
  );

  context.subscriptions.push(
    commands.registerCommand("azurite.start", () => {
      blobServerManager.start();
      queueServerManager.start();
      tableServerManager.start();
      dataLakeServerManager.start();
    }),
    commands.registerCommand("azurite.close", () => {
      blobServerManager.close();
      queueServerManager.close();
      tableServerManager.close();
      dataLakeServerManager.close();
    }),
    commands.registerCommand("azurite.clean", () => {
      blobServerManager.clean();
      queueServerManager.clean();
      tableServerManager.clean();
      dataLakeServerManager.clean();
    }),

    commands.registerCommand(blobServerManager.getStartCommand(), async () => {
      await blobServerManager.start();
    }),
    commands.registerCommand(blobServerManager.getCloseCommand(), () => {
      blobServerManager.close();
    }),
    commands.registerCommand(blobServerManager.getCleanCommand(), () => {
      blobServerManager.clean();
    }),

    commands.registerCommand(queueServerManager.getStartCommand(), async () => {
      await queueServerManager.start();
    }),
    commands.registerCommand(queueServerManager.getCloseCommand(), () => {
      queueServerManager.close();
    }),
    commands.registerCommand(queueServerManager.getCleanCommand(), () => {
      queueServerManager.clean();
    }),

    commands.registerCommand(tableServerManager.getStartCommand(), async () => {
      await tableServerManager.start();
    }),
    commands.registerCommand(tableServerManager.getCloseCommand(), () => {
      tableServerManager.close();
    }),
    commands.registerCommand(tableServerManager.getCleanCommand(), () => {
      tableServerManager.clean();
    }),

    commands.registerCommand(
      dataLakeServerManager.getStartCommand(),
      async () => {
        await dataLakeServerManager.start();
      }
    ),
    commands.registerCommand(dataLakeServerManager.getCloseCommand(), () => {
      dataLakeServerManager.close();
    }),
    commands.registerCommand(dataLakeServerManager.getCleanCommand(), () => {
      dataLakeServerManager.clean();
    }),

    vscBlobStatusBar.statusBarItem,
    vscQueueStatusBar.statusBarItem,
    vscTableStatusBar.statusBarItem,
    vscDataLakeStatusBar.statusBarItem
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  /* NOOP */
}
