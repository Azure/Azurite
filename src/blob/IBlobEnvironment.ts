export default interface IBlobEnvironment {
  blobHost(): string | undefined;
  blobPort(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  debug(): Promise<string | boolean | undefined>;
}
