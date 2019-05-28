import IVSCServerManagerState from "./IVSCServerManagerState";
import VSCServerManagerBase from "./VSCServerManagerBase";
import VSCServerManagerClosedState from "./VSCServerManagerClosedState";

export class VSCServerManagerRunningState implements IVSCServerManagerState {
  public async start(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    throw new Error(
      `Cannot start server. ${serverManager.name} is already running.`
    );
  }

  public async close(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    await serverManager.closeImpl();
    return new VSCServerManagerClosedState();
  }

  public async clean(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    throw new Error(
      `Cannot clean server. ${
        serverManager.name
      } is running. Please close before cleaning up.`
    );
  }
}
