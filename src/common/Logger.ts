import ILogger from "./ILogger";
import ILoggerStrategy, { LogLevels } from "./ILoggerStrategy";
import NoLoggerStrategy from "./NoLoggerStrategy";
import WinstonLoggerStrategy from "./WinstonLoggerStrategy";

export class Logger implements ILogger {
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
// Default NoLoggerStrategy will be used
// Config Logger with WinstonLoggerStrategy will display all levels logs to console STD
const logger = new Logger(new NoLoggerStrategy());

/**
 * Config global singleton logger instance.
 *
 * @export
 * @param {boolean} enable
 * @param {string} [logFile]
 */
export function configLogger(enable: boolean, logFile?: string) {
  if (enable) {
    logger.strategy = new WinstonLoggerStrategy(LogLevels.Debug, logFile);
  } else {
    logger.strategy = new NoLoggerStrategy();
  }
}

export default logger;
