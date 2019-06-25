import { StatusBarItem } from "vscode";

import IVSCServerManagerEventsHandler from "./IVSCServerManagerEventsHandler";
import { ServerStatus } from "./ServerBase";
import VSCServerManagerBase from "./VSCServerManagerBase";

export default class VSCStatusBarItem
  implements IVSCServerManagerEventsHandler {
  constructor(
    public readonly serverManager: VSCServerManagerBase,
    public readonly statusBarItem: StatusBarItem
  ) {
    this.statusBarItem.text = `[${serverManager.name}]`;
    this.statusBarItem.command = serverManager.getStartCommand();
    this.statusBarItem.tooltip = `Start ${serverManager.name}`;
    this.statusBarItem.show();
  }

  public onStart(serverManager: VSCServerManagerBase): void {
    this.statusBarItem.text = `[${serverManager.name}] Starting...`;
    this.statusBarItem.command = undefined;
    this.statusBarItem.tooltip = ``;
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
    this.statusBarItem.text = `[${
      serverManager.name
    }] Running on ${server.getHttpServerAddress()}`;
    this.statusBarItem.command = serverManager.getCloseCommand();
    this.statusBarItem.tooltip = `Close ${serverManager.name}`;
    this.statusBarItem.show();
  }

  public onClean(serverManager: VSCServerManagerBase): void {
    this.statusBarItem.text = `[${serverManager.name}] Cleaning`;
    this.statusBarItem.command = undefined;
    this.statusBarItem.tooltip = ``;
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
    this.statusBarItem.text = `[${serverManager.name}]`;
    this.statusBarItem.command = serverManager.getStartCommand();
    this.statusBarItem.tooltip = `Start ${serverManager.name}`;
    this.statusBarItem.show();
  }

  public onClose(serverManager: VSCServerManagerBase): void {
    this.statusBarItem.text = `[${serverManager.name}] Closing...`;
    this.statusBarItem.command = undefined;
    this.statusBarItem.tooltip = ``;
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
    this.statusBarItem.text = `[${serverManager.name}]`;
    this.statusBarItem.command = serverManager.getStartCommand();
    this.statusBarItem.tooltip = `Start ${serverManager.name}`;
    this.statusBarItem.show();
  }
}
