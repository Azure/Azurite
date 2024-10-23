/**
 * This interface defines the required functions of TableEnvironment given command line parameter
 * @export
 * @interface ITableEnvironment
 */
export default interface ITableEnvironment {
  /** Optional. Customize listening address for table */
  tableHost(): string | undefined;
  /** Optional. Customize listening port for table */
  tablePort(): number | undefined;
  /** Optional. Customize keep alive timeout for table */
  tableKeepAliveTimeout(): number | undefined;
  /** Optional. Use an existing folder as workspace path, default is current working directory */
  location(): Promise<string>;
  /** Optional. Disable access log displayed in console */
  silent(): boolean;
  /** Optional. Enable loose mode which ignores unsupported headers and parameters */
  loose(): boolean;
  /** Optional. Skip the request API version check request with all Api versions will be allowed */
  skipApiVersionCheck(): boolean;
  /** Optional. Disable getting account name from the host of request URI, always get account name from the first path segment of request URI. */
  disableProductStyleUrl(): boolean;
  /** Optional. Enable debug log by providing a valid local file, path as log destination path as log destination */
  debug(): Promise<string | boolean | undefined>;
  /** Optional. Disable persisting any data to disk. If the Azurite process is terminated, all data is lost */
  inMemoryPersistence(): boolean;
  /** Optional. Disable telemtry collection of Azurite. If not specify this parameter Azurite will collect telemetry data by default. */
  disableTelemetry(): boolean;
}
