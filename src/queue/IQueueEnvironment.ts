export default interface IQueueEnvironment {
  queueHost(): string | undefined;
  queuePort(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  loose(): boolean;
  debug(): Promise<string | boolean | undefined>;
}
