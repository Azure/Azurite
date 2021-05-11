import { EventEmitter } from "events";
import { ProgressLocation, window } from "vscode";

import IVSCServerManagerEventsHandler from "./IVSCServerManagerEventsHandler";
import VSCServerManagerBase from "./VSCServerManagerBase";

export default class VSCProgress
  extends EventEmitter
  implements IVSCServerManagerEventsHandler {
  private readonly START_SUCCESS = "startSuccess_";
  private readonly START_FAIL = "startFail_";
  private readonly CLEAN_SUCCESS = "cleanSuccess_";
  private readonly CLEAN_FAIL = "cleanFail_";
  private readonly CLOSE_SUCCESS = "closeSuccess_";
  private readonly CLOSE_FAIL = "closeFail_";

  public onStart(serverManager: VSCServerManagerBase, session: number): void {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `Starting ${serverManager.name}`
      },
      (progress) => {
        progress.report({
          increment: 5,
          message: `${serverManager.name} is starting...`
        });
        return new Promise<void>((resolve, reject) => {
          const resolveCallback = () => {
            this.removeListener(this.START_SUCCESS + session, resolveCallback);
            this.removeListener(this.START_FAIL + session, rejectCallback);
            resolve();
          };

          const rejectCallback = () => {
            this.removeListener(this.START_SUCCESS + session, resolveCallback);
            this.removeListener(this.START_FAIL + session, rejectCallback);
            reject();
          };

          this.once(this.START_SUCCESS + session, resolveCallback);
          this.once(this.START_FAIL + session, rejectCallback);
        });
      }
    );
  }

  public onStartFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    this.emit(this.START_FAIL + session, error);
  }

  public onStartSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    this.emit(this.START_SUCCESS + session);
  }

  public onClean(serverManager: VSCServerManagerBase, session: number): void {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `Cleaning ${serverManager.name}`
      },
      (progress) => {
        progress.report({
          increment: 5,
          message: `${serverManager.name} is cleaning`
        });
        return new Promise<void>((resolve, reject) => {
          const resolveCallback = () => {
            this.removeListener(this.CLEAN_SUCCESS + session, resolveCallback);
            this.removeListener(this.CLEAN_FAIL + session, rejectCallback);
            resolve();
          };

          const rejectCallback = () => {
            this.removeListener(this.CLEAN_SUCCESS + session, resolveCallback);
            this.removeListener(this.CLEAN_FAIL + session, rejectCallback);
            reject();
          };

          this.once(this.CLEAN_SUCCESS + session, resolveCallback);
          this.once(this.CLEAN_FAIL + session, rejectCallback);
        });
      }
    );
  }

  public onCleanFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    this.emit(this.CLEAN_FAIL + session, error);
  }

  public onCleanSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    this.emit(this.CLEAN_SUCCESS + session);
  }

  public onClose(serverManager: VSCServerManagerBase, session: number): void {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `Closing ${serverManager.name}`
      },
      (progress) => {
        progress.report({
          increment: 5,
          message: `${serverManager.name} is closing`
        });
        return new Promise<void>((resolve, reject) => {
          const resolveCallback = () => {
            this.removeListener(this.CLOSE_SUCCESS + session, resolveCallback);
            this.removeListener(this.CLOSE_FAIL + session, rejectCallback);
            resolve();
          };

          const rejectCallback = () => {
            this.removeListener(this.CLOSE_SUCCESS + session, resolveCallback);
            this.removeListener(this.CLOSE_FAIL + session, rejectCallback);
            reject();
          };

          this.once(this.CLOSE_SUCCESS + session, resolveCallback);
          this.once(this.CLOSE_FAIL + session, rejectCallback);
        });
      }
    );
  }

  public onCloseFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    this.emit(this.CLOSE_FAIL + session, error);
  }

  public onCloseSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    this.emit(this.CLOSE_SUCCESS + session);
  }
}
