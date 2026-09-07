import { strict as assert } from "assert";
import { StatusBarItem } from "vscode";

import ServerBase, { ServerStatus } from "../../src/common/ServerBase";
import IVSCServerManagerState from "../../src/common/IVSCServerManagerState";
import VSCServerManagerBase from "../../src/common/VSCServerManagerBase";
import VSCStatusBarItem from "../../src/common/VSCStatusBarItem";

// Minimal implementation of the vscode StatusBarItem contract, typed against
// the @types/vscode declarations so that the extension code is validated
// against the current typings without loading the vscode runtime module.
class FakeStatusBarItem implements StatusBarItem {
  public readonly id: string = "azurite.test";
  public readonly alignment: StatusBarItem["alignment"] =
    1 as StatusBarItem["alignment"];
  public readonly priority: number | undefined = undefined;
  public name: StatusBarItem["name"] = undefined;
  public text: StatusBarItem["text"] = "";
  public tooltip: StatusBarItem["tooltip"] = undefined;
  public color: StatusBarItem["color"] = undefined;
  public backgroundColor: StatusBarItem["backgroundColor"] = undefined;
  public command: StatusBarItem["command"] = undefined;
  public accessibilityInformation: StatusBarItem["accessibilityInformation"] =
    undefined;
  public shownTimes: number = 0;

  public show(): void {
    this.shownTimes++;
  }

  public hide(): void {
    // no-op
  }

  public dispose(): void {
    // no-op
  }
}

class FakeServerManager extends VSCServerManagerBase {
  public constructor(server?: ServerBase) {
    super("Azurite Test Service", {} as IVSCServerManagerState, server);
  }

  public getStartCommand(): string {
    return "azurite.start_test";
  }

  public getCloseCommand(): string {
    return "azurite.close_test";
  }

  public getCleanCommand(): string {
    return "azurite.clean_test";
  }

  public async createImpl(): Promise<void> {
    // no-op
  }

  public async startImpl(): Promise<void> {
    // no-op
  }

  public async closeImpl(): Promise<void> {
    // no-op
  }

  public async cleanImpl(): Promise<void> {
    // no-op
  }
}

function createServer(status: ServerStatus, address: string): ServerBase {
  return {
    getStatus: () => status,
    getHttpServerAddress: () => address
  } as unknown as ServerBase;
}

describe("VSCStatusBarItem @loki", () => {
  it("initializes the status bar item with the start command @loki", () => {
    const item = new FakeStatusBarItem();
    const manager = new FakeServerManager();

    new VSCStatusBarItem(manager, item);

    assert.strictEqual(item.text, "[Azurite Test Service]");
    assert.strictEqual(item.command, "azurite.start_test");
    assert.strictEqual(item.tooltip, "Start Azurite Test Service");
    assert.strictEqual(item.shownTimes, 1);
  });

  it("clears the command while the server is starting @loki", () => {
    const item = new FakeStatusBarItem();
    const manager = new FakeServerManager();
    const statusBarItem = new VSCStatusBarItem(manager, item);

    statusBarItem.onStart(manager);

    assert.strictEqual(item.text, "[Azurite Test Service] Starting...");
    assert.strictEqual(item.command, undefined);
    assert.strictEqual(item.tooltip, "");
  });

  it("displays the listening address once the server is running @loki", () => {
    const item = new FakeStatusBarItem();
    const manager = new FakeServerManager(
      createServer(ServerStatus.Running, "http://127.0.0.1:10000")
    );
    const statusBarItem = new VSCStatusBarItem(manager, item);

    statusBarItem.onStartSuccess(manager);

    assert.strictEqual(
      item.text,
      "[Azurite Test Service] Running on http://127.0.0.1:10000"
    );
    assert.strictEqual(item.command, "azurite.close_test");
    assert.strictEqual(item.tooltip, "Close Azurite Test Service");
  });

  it("falls back to the closed state when start fails without a server @loki", () => {
    const item = new FakeStatusBarItem();
    const manager = new FakeServerManager();
    const statusBarItem = new VSCStatusBarItem(manager, item);

    statusBarItem.onStartFail(manager, 0, new Error("start failed"));

    assert.strictEqual(item.text, "[Azurite Test Service]");
    assert.strictEqual(item.command, "azurite.start_test");
    assert.strictEqual(item.tooltip, "Start Azurite Test Service");
  });
});
