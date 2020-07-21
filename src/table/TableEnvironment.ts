/**
 * This file store table parameter from command line parameters
 */

import args from "args";
import ITableEnvironment from "./ITableEnvironment";
import {
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_SERVER_HOST_NAME
} from "./utils/constants";

args
  .option(
    ["", "tableHost"],
    "Optional. Customize listening address for table",
    DEFAULT_TABLE_SERVER_HOST_NAME
  )
  .option(
    ["", "tablePort"],
    "Optional. Customize listening port for table",
    DEFAULT_TABLE_LISTENING_PORT
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
  .option(
    ["", "skipApiVersionCheck"],
    "Optional. Skip the request API version check, request with all Api versions will be allowed"
  )
  .option(
    ["d", "debug"],
    "Optional. Enable debug log by providing a valid local file path as log destination"
  );

(args as any).config.name = "azurite-table";

/**
 * This class store table configuration from command line parameters
 * @export
 *
 */
export default class TableEnvironment implements ITableEnvironment {
  private flags = args.parse(process.argv);

  public tableHost(): string | undefined {
    return this.flags.tableHost;
  }

  public tablePort(): number | undefined {
    return this.flags.tablePort;
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

  public skipApiVersionCheck(): boolean {
    if (this.flags.skipApiVersionCheck !== undefined) {
      return true;
    }
    // default is false which will check API veresion
    return false;
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
