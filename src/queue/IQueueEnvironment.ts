export default interface IQueueEnvironment {
  queueHost(): string | undefined;
  queuePort(): number | undefined;
  queueKeepAliveTimeout(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  loose(): boolean;
  skipApiVersionCheck(): boolean;
  disableProductStyleUrl(): boolean;
  cert(): string | undefined;
  key(): string | undefined;
  pwd(): string | undefined;
  debug(): Promise<string | boolean | undefined>;
  inMemoryPersistence(): boolean;
  extentMemoryLimit(): number | undefined;
  disableTelemetry(): boolean;
}
