import ILogger from "../../generated/utils/ILogger";
import ILoggerStrategy from "./ILoggerStrategy";
import WinstonLoggerStrategy from "./WinstonLoggerStrategy";

export class Logger implements ILogger {
  public constructor(private strategy: ILoggerStrategy) {}

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

const logger = new Logger(new WinstonLoggerStrategy());
export default logger;
