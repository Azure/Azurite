export default interface IGCManager {
  start(): Promise<void>;
  close(): Promise<void>;
}
