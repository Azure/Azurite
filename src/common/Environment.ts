import args from "args";

import {
  DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
  DEFAULT_BLOB_LISTENING_PORT,
  DEFAULT_BLOB_SERVER_HOST_NAME
} from "../blob/utils/constants";

import {
  DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT,
  DEFAULT_QUEUE_LISTENING_PORT,
  DEFAULT_QUEUE_SERVER_HOST_NAME
} from "../queue/utils/constants";

import {
  DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT,
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_SERVER_HOST_NAME
} from "../table/utils/constants";

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
    ["", "blobKeepAliveTimeout"],
    "Optional. Customize http keep alive timeout for blob",
    DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
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
    ["", "queueKeepAliveTimeout"],
    "Optional. Customize http keep alive timeout for queue",
    DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT,
  )
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
    "Optional. Disable getting account name from the host of request URI, always get account name from the first path segment of request URI"
  )
  .option(["", "oauth"], 'Optional. OAuth level. Candidate values: "basic"')
  .option(["", "cert"], "Optional. Path to certificate file")
  .option(["", "key"], "Optional. Path to certificate key .pem file")
  .option(["", "pwd"], "Optional. Password for .pfx file")
  .option(
    ["", "inMemoryPersistence"],
    "Optional. Disable persisting any data to disk. If the Azurite process is terminated, all data is lost"
  )
  .option(
    ["", "extentMemoryLimit"],
    "Optional. The number of megabytes to limit in-memory extent storage to. Only used with the --inMemoryPersistence option. Defaults to 50% of total memory",
    -1,
    s => s == -1 ? undefined : parseFloat(s)
  )
  .option(
    ["d", "debug"],
    "Optional. Enable debug log by providing a valid local file path as log destination"
  )
  .option(
    ["", "disableProductStyleUrl"],
    "Optional. Disable getting account name from the host of request Uri, always get account name from the first path segment of request Uri"
  )
  .option(
    ["", "disableTelemetry"],
    "Optional. Disable telemtry collection of Azurite. If not specify this parameter Azurite will collect telemetry data by default."
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

  public blobKeepAliveTimeout(): number | undefined {
    return this.flags.blobKeepAliveTimeout;
  }

  public queueHost(): string | undefined {
    return this.flags.queueHost;
  }

  public queuePort(): number | undefined {
    return this.flags.queuePort;
  }

  public queueKeepAliveTimeout(): number | undefined {
    return this.flags.queueKeepAliveTimeout;
  }

  public tableHost(): string | undefined {
    return this.flags.tableHost;
  }

  public tablePort(): number | undefined {
    return this.flags.tablePort;
  }

  public tableKeepAliveTimeout(): number | undefined {
    return this.flags.tableKeepAliveTimeout;
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

  public inMemoryPersistence(): boolean {
    if (this.flags.inMemoryPersistence !== undefined) {
      if (this.flags.location) {
        throw new RangeError(`The --inMemoryPersistence option is not supported when the --location option is set.`)
      }
      return true;
    } else {
      if (this.extentMemoryLimit() !== undefined) {
        throw new RangeError(`The --extentMemoryLimit option is only supported when the --inMemoryPersistence option is set.`)
      }
    }
    return false;
  }

  public extentMemoryLimit(): number | undefined {
    return this.flags.extentMemoryLimit;
  }

  public disableTelemetry(): boolean {
    if (this.flags.disableTelemetry !== undefined) {
      return true;
    }
    // default is false which will collect telemetry data
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
