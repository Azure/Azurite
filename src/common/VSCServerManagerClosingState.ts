import IVSCServerManagerState from "./IVSCServerManagerState";
import VSCServerManagerBase from "./VSCServerManagerBase";

export default class VSCServerManagerClosingState
  implements IVSCServerManagerState {
  public async start(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    throw new Error(`Cannot start server. ${serverManager.name} is closing.`);
  }

  public async close(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    throw new Error(`Cannot close server. ${serverManager.name} is closing.`);
  }

  public async clean(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    throw new Error(`Cannot clean server. ${serverManager.name} is closing.`);
  }
}
