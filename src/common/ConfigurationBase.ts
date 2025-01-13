import * as fs from "fs";
import { OAuthLevel } from "./models";
import IBlobEnvironment from "../blob/IBlobEnvironment";
import IQueueEnvironment from "../queue/IQueueEnvironment";
import { DEFAULT_EXTENT_MEMORY_LIMIT, SharedChunkStore } from "./persistence/MemoryExtentStore";
import { totalmem } from "os";
import logger from "./Logger";
import IEnvironment from "./IEnvironment";

export enum CertOptions {
  Default,
  PEM,
  PFX
}

export function setExtentMemoryLimit(env: IBlobEnvironment | IQueueEnvironment | IEnvironment, logToConsole: boolean) {
  if (env.inMemoryPersistence()) {
    let mb = env.extentMemoryLimit()
    if (mb === undefined || typeof mb !== 'number') {
      mb = DEFAULT_EXTENT_MEMORY_LIMIT / (1024 * 1024)
    }

    if (mb < 0) {
      throw new Error(`A negative value of '${mb}' is not allowed for the extent memory limit.`)
    }

    if (mb >= 0) {
      const bytes = Math.round(mb * 1024 * 1024);
      const totalPct = Math.round(100 * bytes / totalmem())
      const message = `In-memory extent storage is enabled with a limit of ${mb.toFixed(2)} MB (${bytes} bytes, ${totalPct}% of total memory).`
      if (logToConsole) {
        console.log(message)
      }
      logger.info(message)
      SharedChunkStore.setSizeLimit(bytes);
    } else {
      const message = `In-memory extent storage is enabled with no limit on memory used.`
      if (logToConsole) {
        console.log(message)
      }
      logger.info(message)
      SharedChunkStore.setSizeLimit();
    }
  }
}

export default abstract class ConfigurationBase {
  public constructor(
    public readonly host: string,
    public readonly port: number,
    public readonly keepAliveTimeout: number,
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
