import { commands, ExtensionContext, StatusBarAlignment, window } from "vscode";

import VSCAccessLog from "./common/VSCAccessLog";
import VSCNotification from "./common/VSCNotification";
import VSCProgress from "./common/VSCProgress";
import VSCServerManagerBlob from "./common/VSCServerManagerBlob";
import VSCStatusBarItem from "./common/VSCStatusBarItem";

export function activate(context: ExtensionContext) {
  console.log("Azurite extension is now active!");

  // Initialize server managers
  const blobServerManager = new VSCServerManagerBlob();

  // Hook up status bar handlers
  const vscBlobStatusBar = new VSCStatusBarItem(
    blobServerManager,
    window.createStatusBarItem(StatusBarAlignment.Right, 100)
  );
  blobServerManager.addEventListener(vscBlobStatusBar);

  // Hook up notification handlers
  blobServerManager.addEventListener(new VSCNotification());

  // Hook up progress handlers
  blobServerManager.addEventListener(new VSCProgress());

  // Hook up access log handlers
  blobServerManager.addEventListener(
    new VSCAccessLog(blobServerManager.accessChannelStream)
  );

  context.subscriptions.push(
    commands.registerCommand("azurite.start", () => {
      blobServerManager.start();
    }),
    commands.registerCommand("azurite.close", () => {
      blobServerManager.close();
    }),
    commands.registerCommand("azurite.clean", () => {
      blobServerManager.clean();
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
    vscBlobStatusBar.statusBarItem
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
