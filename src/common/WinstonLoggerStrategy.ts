import { createLogger, format, Logger as IWinstonLogger, transports } from "winston";

import ILoggerStrategy, { LogLevels } from "./ILoggerStrategy";

/**
 * A logger strategy can log to console or file.
 *
 * @export
 * @class WinstonLoggerStrategy
 * @implements {ILoggerStrategy}
 */
export default class WinstonLoggerStrategy implements ILoggerStrategy {
  private readonly winstonLogger: IWinstonLogger;
  private readonly consoleTransport?: transports.ConsoleTransportInstance;
  private readonly fileTransport?: transports.FileTransportInstance;

  /**
   * Creates an instance of WinstonLoggerStrategy.
   *
   * @param {LogLevels} [level=LogLevels.Debug]
   * @param {string} [logfile] Log to specific file, otherwise to console.
   * @memberof WinstonLoggerStrategy
   */
  public constructor(level: LogLevels = LogLevels.Debug, logfile?: string) {
    this.winstonLogger = createLogger({
      format: format.combine(
        format.timestamp(),
        format.printf(
          info =>
            `${info.timestamp} ${info.contextID} ${info.level}: ${info.message}`
        )
      ),
      level
    });

    if (logfile) {
      this.fileTransport = new transports.File({ filename: logfile });
      this.winstonLogger.add(this.fileTransport);
    } else {
      this.consoleTransport = new transports.Console();
      this.winstonLogger.add(this.consoleTransport);
    }
  }

  public log(
    level: LogLevels,
    message: string,
    contextID: string = "\t"
  ): void {
    this.winstonLogger.log({ level, message, contextID });
  }
}
