/**
 * This file store table parameter from command line parameters
 */

import args from "args";
import ITableEnvironment from "./ITableEnvironment";
import {
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_SERVER_HOST_NAME,
  DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT
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
    ["", "tableKeepAliveTimeout"],
    "Optional. Customize http keep alive timeout for table",
    DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT,
  )
  .option(
    ["l", "location"],
    "Optional. Use an existing folder as workspace path, default is current working directory",
    "<cwd>",
    s => s == "<cwd>" ? undefined : s
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
    ["", "disableProductStyleUrl"],
    "Optional. Disable getting account name from the host of request URI, always get account name from the first path segment of request URI."
  )
  .option(
    ["", "inMemoryPersistence"],
    "Optional. Disable persisting any data to disk. If the Azurite process is terminated, all data is lost"
  )
  .option(
    ["d", "debug"],
    "Optional. Enable debug log by providing a valid local file path as log destination"
  )
  .option(["", "oauth"], 'Optional. OAuth level. Candidate values: "basic"')
  .option(["", "cert"], "Optional. Path to certificate file")
  .option(["", "key"], "Optional. Path to certificate key .pem file")
  .option(["", "pwd"], "Optional. Password for .pfx file")
  .option(
    ["", "disableTelemetry"],
    "Optional. Disable telemetry data collection of this Azurite execution. By default, Azurite will collect telemetry data to help improve the product."
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

  public tableKeepAliveTimeout(): number | undefined {
    return this.flags.tableKeepAvlieTimeout;
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
    // default is false which will check API version
    return false;
  }

  public disableProductStyleUrl(): boolean {
    if (this.flags.disableProductStyleUrl !== undefined) {
      return true;
    }
    // default is false which will try to get account name from request URI hostname
    return false;
  }

  public disableTelemetry(): boolean {
    if (this.flags.disableTelemetry !== undefined) {
      return true;
    }
    // default is false which will collect telemetry data
    return false;
  }

  public inMemoryPersistence(): boolean {
    if (this.flags.inMemoryPersistence !== undefined) {
      if (this.flags.location) {
        throw new RangeError(`The --inMemoryPersistence option is not supported when the --location option is set.`)
      }
      return true;
    }
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

  public oauth(): string | undefined {
    return this.flags.oauth;
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
}
