export default interface IBlobEnvironment {
  blobHost(): string | undefined;
  blobPort(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  loose(): boolean;
  cert(): string | undefined;
  key(): string | undefined;
  pwd(): string | undefined;
  debug(): Promise<string | boolean | undefined>;
}
