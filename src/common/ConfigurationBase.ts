const fs = require("fs");

export enum CertOptions {
  Default,
  MkCert,
  DevCert
}

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
    public readonly key: string = "",
    public readonly pwd: string = ""
  ) {}

  public hasCert() {
    if (this.cert.length > 0 && this.key.length > 0) {
      return CertOptions.MkCert;
    }
    if (this.cert.length > 0 && this.pwd.toString().length > 0) {
      return CertOptions.DevCert;
    }

    return CertOptions.Default;
  }

  public getCert(option: any) {
    switch (option) {
      case CertOptions.MkCert:
        return {
          cert: fs.readFileSync(this.cert),
          key: fs.readFileSync(this.key)
        };
      case CertOptions.DevCert:
        return {
          pfx: fs.readFileSync(this.cert),
          passphrase: this.pwd.toString()
        };
      default:
        throw Error("Http server do not need cert");
    }
  }

  public getHttpServerAddress(): string {
    return `http${this.hasCert() == CertOptions.Default ? "" : "s"}://${
      this.host
    }:${this.port}`;
  }
}
