import { commands, ExtensionContext, StatusBarAlignment, window } from "vscode";

import VSCAccessLog from "./common/VSCAccessLog";
import VSCNotification from "./common/VSCNotification";
import VSCProgress from "./common/VSCProgress";
import VSCStatusBarItem from "./common/VSCStatusBarItem";

export async function activate(context: ExtensionContext) {
  // Lazily load the server manager modules (and their heavy dependency
  // trees, such as the Blob/Queue/Table server implementations) only when
  // the extension is actually activated, instead of eagerly requiring them
  // at module load time. This significantly reduces the extension's
  // "codeLoadingTime" reported by VS Code, since the cost of loading these
  // modules is deferred to an asynchronous import instead of being paid
  // synchronously while VS Code loads the extension's main module.
  const [
    { default: VSCServerManagerBlob },
    { default: VSCServerManagerQueue },
    { default: VSCServerManagerTable }
  ] = await Promise.all([
    import("./common/VSCServerManagerBlob"),
    import("./common/VSCServerManagerQueue"),
    import("./common/VSCServerManagerTable")
  ]);

  // Initialize server managers
  const blobServerManager = new VSCServerManagerBlob();
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

  blobServerManager.addEventListener(vscBlobStatusBar);
  queueServerManager.addEventListener(vscQueueStatusBar);
  tableServerManager.addEventListener(vscTableStatusBar);

  // Hook up notification handlers
  const notification = new VSCNotification();
  blobServerManager.addEventListener(notification);
  queueServerManager.addEventListener(notification);
  tableServerManager.addEventListener(notification);

  // Hook up progress handlers
  blobServerManager.addEventListener(new VSCProgress());
  queueServerManager.addEventListener(new VSCProgress());
  tableServerManager.addEventListener(new VSCProgress());

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

  context.subscriptions.push(
    commands.registerCommand("azurite.start", async () => {
      await Promise.all([
        blobServerManager.start(),
        queueServerManager.start(),
        tableServerManager.start()
      ]);
    }),
    commands.registerCommand("azurite.close", async () => {
      await Promise.all([
        blobServerManager.close(),
        queueServerManager.close(),
        tableServerManager.close()
      ]);
    }),
    commands.registerCommand("azurite.clean", () => {
      blobServerManager.clean();
      queueServerManager.clean();
      tableServerManager.clean();
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

    vscBlobStatusBar.statusBarItem,
    vscQueueStatusBar.statusBarItem,
    vscTableStatusBar.statusBarItem
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  /* NOOP */
}
