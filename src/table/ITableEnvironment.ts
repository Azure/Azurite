/**
 * This interface defines the required functions of TableEnvironment given command line parameter
 */
export default interface ITableEnvironment {
  tableHost(): string | undefined;
  tablePort(): number | undefined;
  location(): Promise<string>;
  silent(): boolean;
  loose(): boolean;
  skipApiVersionCheck(): boolean;
  debug(): Promise<string | boolean | undefined>;
}
