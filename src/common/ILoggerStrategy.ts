export default interface ILoggerStrategy {
  log(level: string, message: string, contextID?: string): void;
}
