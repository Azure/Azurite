import { commands, ExtensionContext, StatusBarAlignment, window } from "vscode";

import VSCAccessLog from "./common/VSCAccessLog";
import VSCNotification from "./common/VSCNotification";
import VSCProgress from "./common/VSCProgress";
import VSCServerManagerBlob from "./common/VSCServerManagerBlob";
import VSCServerManagerQueue from "./common/VSCServerManagerQueue";
import VSCStatusBarItem from "./common/VSCStatusBarItem";

export function activate(context: ExtensionContext) {
  // Initialize server managers
  const blobServerManager = new VSCServerManagerBlob();
  const queueServerManager = new VSCServerManagerQueue();

  // Hook up status bar handlers
  const vscBlobStatusBar = new VSCStatusBarItem(
    blobServerManager,
    window.createStatusBarItem(StatusBarAlignment.Right, 1000)
  );
  const vscQueueStatusBar = new VSCStatusBarItem(
    queueServerManager,
    window.createStatusBarItem(StatusBarAlignment.Right, 1001)
  );

  blobServerManager.addEventListener(vscBlobStatusBar);
  queueServerManager.addEventListener(vscQueueStatusBar);

  // Hook up notification handlers
  const notification = new VSCNotification();
  blobServerManager.addEventListener(notification);
  queueServerManager.addEventListener(notification);

  // Hook up progress handlers
  blobServerManager.addEventListener(new VSCProgress());
  queueServerManager.addEventListener(new VSCProgress());

  // Hook up access log handlers
  blobServerManager.addEventListener(
    new VSCAccessLog(blobServerManager.accessChannelStream)
  );
  queueServerManager.addEventListener(
    new VSCAccessLog(queueServerManager.accessChannelStream)
  );

  context.subscriptions.push(
    commands.registerCommand("azurite.start", () => {
      blobServerManager.start();
      queueServerManager.start();
    }),
    commands.registerCommand("azurite.close", () => {
      blobServerManager.close();
      queueServerManager.close();
    }),
    commands.registerCommand("azurite.clean", () => {
      blobServerManager.clean();
      queueServerManager.clean();
    }),

    commands.registerCommand(blobServerManager.getStartCommand(), () => {
      blobServerManager.start();
    }),
    commands.registerCommand(blobServerManager.getCloseCommand(), () => {
      blobServerManager.close();
    }),
    commands.registerCommand(blobServerManager.getCleanCommand(), () => {
      blobServerManager.clean();
    }),

    commands.registerCommand(queueServerManager.getStartCommand(), () => {
      queueServerManager.start();
    }),
    commands.registerCommand(queueServerManager.getCloseCommand(), () => {
      queueServerManager.close();
    }),
    commands.registerCommand(queueServerManager.getCleanCommand(), () => {
      queueServerManager.clean();
    }),

    vscBlobStatusBar.statusBarItem,
    vscQueueStatusBar.statusBarItem
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  /* NOOP */
}
