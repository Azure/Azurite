import VSCServerManagerBase from "./VSCServerManagerBase";

export default interface IVSCServerManagerState {
  start(serverManager: VSCServerManagerBase): Promise<IVSCServerManagerState>;
  close(serverManager: VSCServerManagerBase): Promise<IVSCServerManagerState>;
  clean(serverManager: VSCServerManagerBase): Promise<IVSCServerManagerState>;
}
