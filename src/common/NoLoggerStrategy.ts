import ILoggerStrategy, { LogLevels } from "./ILoggerStrategy";

/**
 * A logger strategy doesn't log anything.
 *
 * @export
 * @class NoLoggerStrategy
 * @implements {ILoggerStrategy}
 */
export default class NoLoggerStrategy implements ILoggerStrategy {
  public log(
    level: LogLevels,
    message: string,
    contextID?: string | undefined
  ): void {
    /** Doesn't handle log */
  }
}
