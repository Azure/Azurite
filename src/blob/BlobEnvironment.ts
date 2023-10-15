import args from "args";
import { access, ensureDir } from "fs-extra";
import { dirname } from "path";

import IBlobEnvironment from "./IBlobEnvironment";
import {
  DEFAULT_BLOB_LISTENING_PORT,
  DEFAULT_BLOB_SERVER_HOST_NAME
} from "./utils/constants";

if (!(args as any).config.name) {
  args
    .option(
      ["", "blobHost"],
      "Optional. Customize listening address for blob",
      DEFAULT_BLOB_SERVER_HOST_NAME
    )
    .option(
      ["", "blobPort"],
      "Optional. Customize listening port for blob",
      DEFAULT_BLOB_LISTENING_PORT
    )
    .option(
      ["l", "location"],
      "Optional. Use an existing folder as workspace path, default is current working directory",
      process.cwd()
    )
    .option(
      ["s", "silent"],
      "Optional. Disable access log displayed in console"
    )
    .option(
      ["L", "loose"],
      "Optional. Enable loose mode which ignores unsupported headers and parameters"
    )
    .option(
      ["", "skipApiVersionCheck"],
      "Optional. Skip the request API version check, request with all Api versions will be allowed"
    )
    .option(["", "oauth"], 'Optional. OAuth level. Candidate values: "basic"')
    .option(["", "cert"], "Optional. Path to certificate file")
    .option(["", "key"], "Optional. Path to certificate key .pem file")
    .option(
      ["d", "debug"],
      "Optional. Enable debug log by providing a valid local file path as log destination"
    )
    .option(["", "pwd"], "Optional. Password for .pfx file")
    .option(
      ["", "disableProductStyleUrl"],
      "Optional. Disable getting account name from the host of request Uri, always get account name from the first path segment of request Uri."
    );

  (args as any).config.name = "azurite-blob";
}

export default class BlobEnvironment implements IBlobEnvironment {
  private flags = args.parse(process.argv);

  public blobHost(): string | undefined {
    return this.flags.blobHost;
  }

  public blobPort(): number | undefined {
    return this.flags.blobPort;
  }

  public async location(): Promise<string> {
    const location = this.flags.location || process.cwd();
    await ensureDir(location);
    await access(location);
    return location;
  }

  public silent(): boolean {
    if (this.flags.silent !== undefined) {
      return true;
    }
    return false;
  }

  public loose(): boolean {
    if (this.flags.loose !== undefined) {
      return true;
    }
    // default is false which will block not supported APIs, headers and parameters
    return false;
  }

  public skipApiVersionCheck(): boolean {
    if (this.flags.skipApiVersionCheck !== undefined) {
      return true;
    }
    // default is false which will check API veresion
    return false;
  }

  public cert(): string | undefined {
    return this.flags.cert;
  }

  public key(): string | undefined {
    return this.flags.key;
  }

  public pwd(): string | undefined {
    return this.flags.pwd;
  }

  public oauth(): string | undefined {
    return this.flags.oauth;
  }

  public disableProductStyleUrl(): boolean {
    if (this.flags.disableProductStyleUrl !== undefined) {
      return true;
    }
    // default is false which will try to get account name from request Uri hostname
    return false;
  }

  public inMemoryPersistence(): boolean {
    if (this.flags.inMemoryPersistence !== undefined) {
      return true;
    }
    return false;
  }

  public async debug(): Promise<string | undefined> {
    if (typeof this.flags.debug === "string") {
      // Enable debug log to file
      const debugFilePath = this.flags.debug;
      await ensureDir(dirname(debugFilePath));
      await access(dirname(debugFilePath));
      return debugFilePath;
    }

    if (this.flags.debug === true) {
      throw RangeError(
        `Must provide a debug log file path for parameter -d or --debug`
      );
    }

    // By default disable debug log
  }
}
