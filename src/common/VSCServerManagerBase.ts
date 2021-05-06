import IVSCServerManagerCommands from "./IVSCServerManagerCommands";
import IVSCServerManagerEventsHandler from "./IVSCServerManagerEventsHandler";
import IVSCServerManagerState from "./IVSCServerManagerState";
import ServerBase from "./ServerBase";
import VSCServerManagerCleaningState from "./VSCServerManagerCleaningState";
import VSCServerManagerClosingState from "./VSCServerManagerClosingState";
import { VSCServerManagerStartingState } from "./VSCServerManagerStartingState";

export default abstract class VSCServerManagerBase
  implements IVSCServerManagerCommands {
  private handlers: IVSCServerManagerEventsHandler[] = [];

  private startSession = 0;
  private closeSession = 0;
  private cleanSession = 0;

  public constructor(
    public readonly name: string,
    protected state: IVSCServerManagerState,
    protected server?: ServerBase
  ) {}

  public getStartCommand(): string {
    throw Error("Should implemented in children class.");
  }

  public getCloseCommand(): string {
    throw Error("Should implemented in children class.");
  }

  public getCleanCommand(): string {
    throw Error("Should implemented in children class.");
  }

  public addEventListener(handler: IVSCServerManagerEventsHandler): void {
    this.handlers.push(handler);
  }

  public getServer(): ServerBase | undefined {
    return this.server;
  }

  public abstract createImpl(): Promise<void>;
  public abstract startImpl(): Promise<void>;
  public abstract closeImpl(): Promise<void>;
  public abstract cleanImpl(): Promise<void>;

  public async start(): Promise<void> {
    this.startSession++;
    const previousState = this.state;
    this.state = new VSCServerManagerStartingState();
    try {
      this.onStart(this.startSession);
      this.state = await previousState.start(this);
      this.onStartSuccess(this.startSession);
    } catch (err) {
      this.state = previousState;
      this.onStartFail(this.startSession, err);
    }
  }

  public async close(): Promise<void> {
    this.closeSession++;
    const previousState = this.state;
    this.state = new VSCServerManagerClosingState();
    try {
      this.onClose(this.closeSession);
      this.state = await previousState.close(this);
      this.onCloseSuccess(this.closeSession);
    } catch (err) {
      this.state = previousState;
      this.onCloseFail(this.closeSession, err);
    }
  }

  public async clean(): Promise<void> {
    this.cleanSession++;
    const previousState = this.state;
    this.state = new VSCServerManagerCleaningState();
    try {
      this.onClean(this.cleanSession);
      this.state = await previousState.clean(this);
      this.onCleanSuccess(this.cleanSession);
    } catch (err) {
      this.state = previousState;
      this.onCleanFail(this.cleanSession, err);
    }
  }

  protected onStart(session: number): void {
    for (const handler of this.handlers) {
      try {
        handler.onStart(this, session);
      } catch {
        /* NOOP */
      }
    }
  }

  protected onStartFail(session: number, error: Error): void {
    for (const handler of this.handlers) {
      try {
        handler.onStartFail(this, session, error);
      } catch {
        /* NOOP */
      }
    }
  }

  protected onStartSuccess(session: number): void {
    for (const handler of this.handlers) {
      try {
        handler.onStartSuccess(this, session);
      } catch {
        /* NOOP */
      }
    }
  }

  protected onClean(session: number): void {
    for (const handler of this.handlers) {
      try {
        handler.onClean(this, session);
      } catch {
        /* NOOP */
      }
    }
  }

  protected onCleanFail(session: number, error: Error): void {
    for (const handler of this.handlers) {
      try {
        handler.onCleanFail(this, session, error);
      } catch {
        /* NOOP */
      }
    }
  }

  protected onCleanSuccess(session: number): void {
    for (const handler of this.handlers) {
      try {
        handler.onCleanSuccess(this, session);
      } catch {
        /* NOOP */
      }
    }
  }

  protected onClose(session: number): void {
    for (const handler of this.handlers) {
      try {
        handler.onClose(this, session);
      } catch {
        /* NOOP */
      }
    }
  }

  protected onCloseFail(session: number, error: Error): void {
    for (const handler of this.handlers) {
      try {
        handler.onCloseFail(this, session, error);
      } catch {
        /* NOOP */
      }
    }
  }

  protected onCloseSuccess(session: number): void {
    for (const handler of this.handlers) {
      try {
        handler.onCloseSuccess(this, session);
      } catch {
        /* NOOP */
      }
    }
  }
}
