export enum LogLevels {
  Error = "error",
  Warn = "warn",
  Info = "info",
  Verbose = "verbose",
  Debug = "debug"
}

export default interface ILoggerStrategy {
  log(level: LogLevels, message: string, contextID?: string): void;
}
