import { window } from "vscode";

import IVSCServerManagerEventsHandler from "./IVSCServerManagerEventsHandler";
import VSCServerManagerBase from "./VSCServerManagerBase";

export default class VSCNotification implements IVSCServerManagerEventsHandler {
  public onStart(serverManager: VSCServerManagerBase, session: number): void {
    // Noop
  }

  public onStartFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    window.showErrorMessage(
      `Start ${serverManager.name} error: ${error.message}`
    );
  }

  public onStartSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    window.showInformationMessage(
      `${
        serverManager.name
      } successfully listens on ${serverManager
        .getServer()!
        .getHttpServerAddress()}`
    );
  }

  public onClean(serverManager: VSCServerManagerBase, session: number): void {
    // Noop
  }

  public onCleanFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    window.showErrorMessage(
      `Clean ${serverManager.name} error: ${error.message}`
    );
  }

  public onCleanSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    window.showInformationMessage(
      `Clean up ${serverManager.name} successfully.`
    );
  }

  public onClose(serverManager: VSCServerManagerBase, session: number): void {
    // Noop
  }

  public onCloseFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    window.showErrorMessage(
      `Close ${serverManager.name} error: ${error.message}`
    );
  }

  public onCloseSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    window.showInformationMessage(`${serverManager.name} successfully closed.`);
  }
}
