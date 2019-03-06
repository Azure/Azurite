import ILoggerStrategy from "./ILoggerStrategy";
import WinstonLoggerStrategy from "./WinstonLoggerStrategy";

export class Logger {
  public constructor(public strategy: ILoggerStrategy) {}

  public error(message: string, contextID?: string) {
    this.strategy.log("error", message, contextID);
  }
  public warn(message: string, contextID?: string) {
    this.strategy.log("warn", message, contextID);
  }
  public info(message: string, contextID?: string) {
    this.strategy.log("info", message, contextID);
  }
  public verbose(message: string, contextID?: string) {
    this.strategy.log("verbose", message, contextID);
  }
  public debug(message: string, contextID?: string) {
    this.strategy.log("debug", message, contextID);
  }
}

// A singleton logger instance
// Could customized logger strategy by assigning a new logger.strategy
// Default WinstonLoggerStrategy will display all levels logs to console STD
const logger = new Logger(new WinstonLoggerStrategy());

export default logger;
