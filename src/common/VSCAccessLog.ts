import { Writable } from "stream";

import IVSCServerManagerEventsHandler from "./IVSCServerManagerEventsHandler";
import VSCServerManagerBase from "./VSCServerManagerBase";

export default class VSCAccessLog implements IVSCServerManagerEventsHandler {
  public constructor(private readonly logStream: Writable) {}

  public onStart(serverManager: VSCServerManagerBase, session: number): void {
    this.logStream.write(`${serverManager.name} is starting...\n`);
  }

  public onStartFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    this.logStream.write(
      `${serverManager.name} starts failed with error: ${error.message} ${
        error.stack
      }\n`
    );
  }

  public onStartSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    const server = serverManager.getServer()!;
    this.logStream.write(
      `${
        serverManager.name
      } successfully listens on ${server.getHttpServerAddress()}\n`
    );
  }

  public onClean(serverManager: VSCServerManagerBase, session: number): void {
    this.logStream.write(`${serverManager.name} is cleaning.\n`);
  }

  public onCleanFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    this.logStream.write(
      `${serverManager.name} failed to clean with error: ${error.message} ${
        error.stack
      }\n`
    );
  }

  public onCleanSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    this.logStream.write(`${serverManager.name} successfully cleaned.\n`);
  }

  public onClose(serverManager: VSCServerManagerBase, session: number): void {
    this.logStream.write(`${serverManager.name} is closing.\n`);
  }

  public onCloseFail(
    serverManager: VSCServerManagerBase,
    session: number,
    error: Error
  ): void {
    this.logStream.write(
      `${serverManager.name} failed to close with error: ${error.message} ${
        error.stack
      }\n`
    );
  }

  public onCloseSuccess(
    serverManager: VSCServerManagerBase,
    session: number
  ): void {
    this.logStream.write(`${serverManager.name} successfully closed.\n`);
  }
}
