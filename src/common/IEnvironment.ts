export default interface IEnvironment {
  blobHost(): string | undefined;
  blobPort(): number | undefined;
  queueHost(): string | undefined;
  queuePort(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  debug(): string | boolean | undefined;
}
