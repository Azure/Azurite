import { StatusBarItem, ThemeColor } from "vscode";

import IVSCServerManagerEventsHandler from "./IVSCServerManagerEventsHandler";
import { ServerStatus } from "./ServerBase";
import VSCServerManagerBase from "./VSCServerManagerBase";

export default class VSCStatusBarItem
  implements IVSCServerManagerEventsHandler {
  private readonly icon: string;
  private readonly offlineColor = new ThemeColor("statusBarItem.offlineForeground");

  constructor(
    public readonly serverManager: VSCServerManagerBase,
    public readonly statusBarItem: StatusBarItem
  ) {
    // Determine icon based on service name
    if (serverManager.name.includes("Blob")) {
      this.icon = "$(file-binary)";
    } else if (serverManager.name.includes("Queue")) {
      this.icon = "$(list-ordered)";
    } else if (serverManager.name.includes("Table")) {
      this.icon = "$(table)";
    } else {
      this.icon = "$(server)";
    }
    this.initialize(this.serverManager);
  }

  public initialize(serverManager: VSCServerManagerBase): void {
    this.statusBarItem.text = this.icon;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = this.offlineColor;
    this.statusBarItem.command = serverManager.getStartCommand();
    this.statusBarItem.tooltip = `${serverManager.name} - Click to start`;
    this.statusBarItem.show();
  }

  public onStart(serverManager: VSCServerManagerBase): void {
    this.statusBarItem.text = "$(sync~spin)";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = undefined;
    this.statusBarItem.command = undefined;
    this.statusBarItem.tooltip = `${serverManager.name} - Starting...`;
    this.statusBarItem.show();
  }

  public onStartFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    const server = serverManager.getServer();
    if (server === undefined) {
      this.onCloseSuccess(serverManager);
      return;
    }

    if (server.getStatus() === ServerStatus.Closed) {
      this.onCloseSuccess(serverManager);
    }
    if (server.getStatus() === ServerStatus.Running) {
      this.onStartSuccess(serverManager);
    }
    if (server.getStatus() === ServerStatus.Closing) {
      this.onClose(serverManager);
    }
    if (server.getStatus() === ServerStatus.Starting) {
      this.onStart(serverManager);
    }
  }

  public onStartSuccess(serverManager: VSCServerManagerBase): void {
    const server = serverManager.getServer()!;
    this.statusBarItem.text = this.icon;
    this.statusBarItem.color = new ThemeColor("ports.iconRunningProcessForeground");
    this.statusBarItem.command = serverManager.getCloseCommand();
    this.statusBarItem.tooltip = `${serverManager.name} - Running on ${server.getHttpServerAddress()}\nClick to close`;
    this.statusBarItem.show();
  }

  public onClean(serverManager: VSCServerManagerBase): void {
    this.statusBarItem.text = "$(sync~spin)";
    this.statusBarItem.command = undefined;
    this.statusBarItem.tooltip = `${serverManager.name} - Cleaning`;
    this.statusBarItem.show();
  }

  public onCleanFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    const server = serverManager.getServer();
    if (server === undefined) {
      this.onCloseSuccess(serverManager);
      return;
    }

    if (server.getStatus() === ServerStatus.Closed) {
      this.onCloseSuccess(serverManager);
    }
    if (server.getStatus() === ServerStatus.Running) {
      this.onStartSuccess(serverManager);
    }
    if (server.getStatus() === ServerStatus.Closing) {
      this.onClose(serverManager);
    }
    if (server.getStatus() === ServerStatus.Starting) {
      this.onStart(serverManager);
    }
  }

  public onCleanSuccess(serverManager: VSCServerManagerBase): void {
    this.initialize(serverManager);
  }

  public onClose(serverManager: VSCServerManagerBase): void {
    this.statusBarItem.text = "$(sync~spin)";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = undefined;
    this.statusBarItem.command = undefined;
    this.statusBarItem.tooltip = `${serverManager.name} - Closing...`;
    this.statusBarItem.show();
  }

  public onCloseFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    const server = serverManager.getServer();
    if (server === undefined) {
      this.onCloseSuccess(serverManager);
      return;
    }

    if (server.getStatus() === ServerStatus.Closed) {
      this.onCloseSuccess(serverManager);
    }
    if (server.getStatus() === ServerStatus.Running) {
      this.onStartSuccess(serverManager);
    }
    if (server.getStatus() === ServerStatus.Closing) {
      this.onClose(serverManager);
    }
    if (server.getStatus() === ServerStatus.Starting) {
      this.onStart(serverManager);
    }
  }

  public onCloseSuccess(serverManager: VSCServerManagerBase): void {
    this.statusBarItem.text = this.icon;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = this.offlineColor;
    this.statusBarItem.command = serverManager.getStartCommand();
    this.statusBarItem.tooltip = `${serverManager.name} - Click to start`;
    this.statusBarItem.show();
  }
}
