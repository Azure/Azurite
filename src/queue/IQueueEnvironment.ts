export default interface IQueueEnvironment {
  queueHost(): string | undefined;
  queuePort(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  debug(): string | boolean | undefined;
}
