export default interface IBlobEnvironment {
  //dfs
  datalakeHost(): string | undefined;
  datalakePort(): number | undefined;
  //blob
  blobHost(): string | undefined;
  blobPort(): number | undefined;
  //common
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
}
