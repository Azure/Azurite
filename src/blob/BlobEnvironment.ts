import args from "args";
import { access } from "fs";
import { dirname } from "path";
import { promisify } from "util";

import IBlobEnvironment from "./IBlobEnvironment";
import {
  DEFAULT_BLOB_LISTENING_PORT,
  DEFAULT_BLOB_SERVER_HOST_NAME
} from "./utils/constants";

const accessAsync = promisify(access);

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
    "location",
    "Optional. Use an existing folder as workspace path, default is current working directory",
    process.cwd()
  )
  .option("silent", "Optional. Disable access log displayed in console")
  .option(
    "debug",
    "Optional. Enable debug log by providing a valid local file path as log destination"
  );

(args as any).config.name = "azurite-queue";

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
    await accessAsync(location);
    return location;
  }

  public silent(): boolean {
    if (this.flags.silent !== undefined) {
      return true;
    }
    return false;
  }

  public async debug(): Promise<string | undefined> {
    if (typeof this.flags.debug === "string") {
      // Enable debug log to file
      const debugFilePath = this.flags.debug;
      await accessAsync(dirname(debugFilePath));
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
