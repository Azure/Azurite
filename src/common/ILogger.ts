/**
 * An interface of logger.
 *
 * @export
 * @interface ILogger
 */
export default interface ILogger {
  error(message: string, contextID?: string): void;
  warn(message: string, contextID?: string): void;
  info(message: string, contextID?: string): void;
  verbose(message: string, contextID?: string): void;
  debug(message: string, contextID?: string): void;
}
