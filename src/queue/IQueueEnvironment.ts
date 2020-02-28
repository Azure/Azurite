export default interface IQueueEnvironment {
  queueHost(): string | undefined;
  queuePort(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  loose(): boolean;
  cert(): string | undefined;
  key(): string | undefined;
  debug(): Promise<string | boolean | undefined>;
}
