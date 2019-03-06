import ConfigurationBase from "./ConfigurationBase";
import ILoggerStrategy, { LogLevels } from "./ILoggerStrategy";
import NoLoggerStrategy from "./NoLoggerStrategy";
import WinstonLoggerStrategy from "./WinstonLoggerStrategy";

export class Logger {
  public constructor(public strategy: ILoggerStrategy) {}

  public error(message: string, contextID?: string) {
    this.strategy.log(LogLevels.Error, message, contextID);
  }

  public warn(message: string, contextID?: string) {
    this.strategy.log(LogLevels.Warn, message, contextID);
  }

  public info(message: string, contextID?: string) {
    this.strategy.log(LogLevels.Info, message, contextID);
  }

  public verbose(message: string, contextID?: string) {
    this.strategy.log(LogLevels.Verbose, message, contextID);
  }

  public debug(message: string, contextID?: string) {
    this.strategy.log(LogLevels.Debug, message, contextID);
  }
}

// A singleton logger instance
// Could customized logger strategy by assigning a new logger.strategy
// Default WinstonLoggerStrategy will display all levels logs to console STD
const debugLogger = new Logger(new WinstonLoggerStrategy());

/**
 * Config global debugLogger instance.
 *
 * @export
 * @param {ConfigurationBase} config
 * @returns {ConfigurationBase}
 */
export function configDebugLog(
  enableDebugLog: boolean,
  debugLogFilePath?: string
) {
  if (enableDebugLog) {
    if (debugLogFilePath !== undefined) {
      debugLogger.strategy = new WinstonLoggerStrategy(
        LogLevels.Debug,
        debugLogFilePath
      );
    }
  } else {
    debugLogger.strategy = new NoLoggerStrategy();
  }
}

export default debugLogger;
