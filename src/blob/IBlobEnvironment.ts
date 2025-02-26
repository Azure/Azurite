export default interface IBlobEnvironment {
  blobHost(): string | undefined;
  blobPort(): number | undefined;
  blobKeepAliveTimeout(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  loose(): boolean;
  skipApiVersionCheck(): boolean;
  cert(): string | undefined;
  key(): string | undefined;
  pwd(): string | undefined;
  debug(): Promise<string | boolean | undefined>;
  oauth(): string | undefined;
  disableProductStyleUrl(): boolean;
  inMemoryPersistence(): boolean;
  extentMemoryLimit(): number | undefined;
  disableTelemetry(): boolean;
}
