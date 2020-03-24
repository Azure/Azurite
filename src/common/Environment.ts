import args from "args";

import {
  DEFAULT_BLOB_LISTENING_PORT,
  DEFAULT_BLOB_SERVER_HOST_NAME
} from "../blob/utils/constants";
import {
  DEFAULT_QUEUE_LISTENING_PORT,
  DEFAULT_QUEUE_SERVER_HOST_NAME
} from "../queue/utils/constants";
import IEnvironment from "./IEnvironment";

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
    ["", "queueHost"],
    "Optional. Customize listening address for queue",
    DEFAULT_QUEUE_SERVER_HOST_NAME
  )
  .option(
    ["", "queuePort"],
    "Optional. Customize listening port for queue",
    DEFAULT_QUEUE_LISTENING_PORT
  )
  .option(
    ["l", "location"],
    "Optional. Use an existing folder as workspace path, default is current working directory",
    process.cwd()
  )
  .option(["s", "silent"], "Optional. Disable access log displayed in console")
  .option(
    ["L", "loose"],
    "Optional. Enable loose mode which ignores unsupported headers and parameters"
  )
  .option(["", "cert"], "Optional. Path to certificate .cert file.")
  .option(["", "key"], "Optional. Path to certificate key .cert file.")
  .option(["", "pwd"], "Optional. Password for .pfx file.")
  .option(
    ["d", "debug"],
    "Optional. Enable debug log by providing a valid local file path as log destination"
  );

(args as any).config.name = "azurite";

export default class Environment implements IEnvironment {
  private flags = args.parse(process.argv);

  public blobHost(): string | undefined {
    return this.flags.blobHost;
  }

  public blobPort(): number | undefined {
    return this.flags.blobPort;
  }

  public queueHost(): string | undefined {
    return this.flags.queueHost;
  }

  public queuePort(): number | undefined {
    return this.flags.queuePort;
  }

  public async location(): Promise<string> {
    return this.flags.location || process.cwd();
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

  public cert(): string | undefined {
    return this.flags.cert;
  }

  public key(): string | undefined {
    return this.flags.key;
  }

  public pwd(): string | undefined {
    return this.flags.pwd;
  }

  public async debug(): Promise<string | undefined> {
    if (typeof this.flags.debug === "string") {
      // Enable debug log to file
      return this.flags.debug;
    }

    if (this.flags.debug === true) {
      throw RangeError(
        `Must provide a debug log file path for parameter -d or --debug`
      );
    }

    // By default disable debug log
  }
}
