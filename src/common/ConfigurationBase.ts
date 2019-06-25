export default abstract class ConfigurationBase {
  public constructor(
    public readonly host: string,
    public readonly port: number,
    public readonly enableAccessLog: boolean = false,
    public readonly accessLogWriteStream?: NodeJS.WritableStream,
    public readonly enableDebugLog: boolean = false,
    public readonly debugLogFilePath?: string
  ) {}
}
