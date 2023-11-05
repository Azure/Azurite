import IVSCServerManagerState from "./IVSCServerManagerState";
import VSCEnvironment from "./VSCEnvironment";
import VSCServerManagerBase from "./VSCServerManagerBase";
import { VSCServerManagerRunningState } from "./VSCServerManagerRunningState";
import { DEFAULT_EXTENT_MEMORY_LIMIT, SharedChunkStore } from "./persistence/MemoryExtentStore";

export default class VSCServerManagerClosedState
  implements IVSCServerManagerState {
  public async start(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    await serverManager.createImpl();
    await serverManager.startImpl();

    const limit = new VSCEnvironment().extentMemoryLimit()
    if (limit) {
      if (limit >= 0) {
        SharedChunkStore.setSizeLimit(Math.round(limit * 1024 * 1024))
      } else {
        SharedChunkStore.setSizeLimit()
      }
    } else {
      SharedChunkStore.setSizeLimit(DEFAULT_EXTENT_MEMORY_LIMIT)
    }

    return new VSCServerManagerRunningState();
  }

  public async close(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    throw new Error(
      `Cannot close server. ${serverManager.name} is already closed.`
    );
  }

  public async clean(
    serverManager: VSCServerManagerBase
  ): Promise<IVSCServerManagerState> {
    await serverManager.cleanImpl();
    return new VSCServerManagerClosedState();
  }
}
