import args from "args";

import {
  DEFAULT_SERVER_HOST_NAME,
  DEFAULT_SERVER_LISTENING_PORT
} from "../blob/utils/constants";

args
  .option(
    ["", "blobHost"],
    "Optional. Customize listening address",
    DEFAULT_SERVER_HOST_NAME
  )
  .option(
    ["", "blobPort"],
    "Optional. Customize listening port",
    DEFAULT_SERVER_LISTENING_PORT
  )
  .option(
    "location",
    "Optional. Use an existing folder as workspace path, default is current working directory",
    process.cwd()
  )
  .option("silent", "Optional. Disable access log displayed in console")
  .option(
    "debug",
    "Optional. Enable debug log by providing a valid local file path as log destination"
  );

(args as any).config.name = "azurite";

export default class Environment {
  private flags = args.parse(process.argv);

  public get blobHost(): string | undefined {
    return this.flags.blobHost;
  }

  public get blobPort(): number | undefined {
    return this.flags.blobPort;
  }

  public get location(): string {
    return this.flags.location || process.cwd();
  }

  public get silent(): boolean {
    if (this.flags.silent !== undefined) {
      return true;
    }
    return false;
  }

  public get debug(): string | undefined {
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
