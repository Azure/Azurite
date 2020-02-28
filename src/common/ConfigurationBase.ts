const fs = require("fs");

export default abstract class ConfigurationBase {
  public constructor(
    public readonly host: string,
    public readonly port: number,
    public readonly enableAccessLog: boolean = false,
    public readonly accessLogWriteStream?: NodeJS.WritableStream,
    public readonly enableDebugLog: boolean = false,
    public readonly debugLogFilePath?: string,
    public readonly loose: boolean = false,
    public readonly cert: string = "",
    public readonly key: string = ""
  ) {}

  hasCert(): boolean {
    return this.cert.length > 0 && this.key.length > 0;
  }

  getCert() {
    return {
      cert: fs.readFileSync(this.cert),
      key: fs.readFileSync(this.key)
    };
  }

  getHttpServerAddress(): string {
    return `http${this.hasCert() ? "s" : ""}://${this.host}:${this.port}`;
  }
}
