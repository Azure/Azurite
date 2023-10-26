import * as fs from "fs";
import { OAuthLevel } from "./models";
import IBlobEnvironment from "../blob/IBlobEnvironment";
import IQueueEnvironment from "../queue/IQueueEnvironment";
import { SharedChunkStore } from "./persistence/MemoryExtentStore";
import { totalmem } from "os";

export enum CertOptions {
  Default,
  PEM,
  PFX
}

export function setExtentMemoryLimit(env: IBlobEnvironment | IQueueEnvironment) {
  if (env.inMemoryPersistence()) {
    let limit = env.extentMemoryLimit() ?? SharedChunkStore.sizeLimit();
    if (limit && limit >= 0) {
      const kb = limit / 1024;
      const mb = kb / 1024;
      const gb = mb / 1024;
      let display;
      if (gb >= 1) {
        display = `${gb.toFixed(2)} GB`
      } else if (mb >= 1) {
        display = `${mb.toFixed(2)} MB`
      } else {
        display = `${kb.toFixed(2)} KB`
      }

      const totalPct = Math.round(100 * limit / totalmem())
      console.log(`In-memory extent storage is enabled with a limit of ${display} (${limit} bytes, ${totalPct}% of total memory).`);
      SharedChunkStore.setSizeLimit(limit);
    } else {
      console.log(`In-memory extent storage is enabled with no limit on memory used.`);
    }
  }
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
    public readonly skipApiVersionCheck: boolean = false,
    public readonly cert: string = "",
    public readonly key: string = "",
    public readonly pwd: string = "",
    public readonly oauth?: string,
    public readonly disableProductStyleUrl: boolean = false,
  ) { }

  public hasCert() {
    if (this.cert.length > 0 && this.key.length > 0) {
      return CertOptions.PEM;
    }
    if (this.cert.length > 0 && this.pwd.toString().length > 0) {
      return CertOptions.PFX;
    }

    return CertOptions.Default;
  }

  public getCert(option: any) {
    switch (option) {
      case CertOptions.PEM:
        return {
          cert: fs.readFileSync(this.cert),
          key: fs.readFileSync(this.key)
        };
      case CertOptions.PFX:
        return {
          pfx: fs.readFileSync(this.cert),
          passphrase: this.pwd.toString()
        };
      default:
        return null;
    }
  }

  public getOAuthLevel(): undefined | OAuthLevel {
    if (this.oauth) {
      if (this.oauth.toLowerCase() === "basic") {
        return OAuthLevel.BASIC;
      }
    }

    return;
  }

  public getHttpServerAddress(): string {
    return `http${this.hasCert() === CertOptions.Default ? "" : "s"}://${this.host
      }:${this.port}`;
  }
}
