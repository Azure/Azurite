import VSCServerManagerBase from "./VSCServerManagerBase";

export default interface IVSCServerManagerEventsHandler {
  onStart(serverManager: VSCServerManagerBase, session: number): void;
  onStartFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void;
  onStartSuccess(serverManager: VSCServerManagerBase, session: number): void;
  onClean(serverManager: VSCServerManagerBase, session: number): void;
  onCleanFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void;
  onCleanSuccess(serverManager: VSCServerManagerBase, session: number): void;
  onClose(serverManager: VSCServerManagerBase, session: number): void;
  onCloseFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void;
  onCloseSuccess(serverManager: VSCServerManagerBase, session: number): void;
}
