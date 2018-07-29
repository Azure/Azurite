import * as express from "express";
import { Server } from "http";

const BbPromise = from "bluebird"),
  bodyParser = from "body-parser"),
  env = from "./core/env"),
  tableStorageManager = from "./core/table/TableStorageManager"),
  morgan = from "morgan"),
  cli = from "./core/cli");

class AzuriteTable {
  private server!: Server;
  constructor() {
    // Support for PM2 Graceful Shutdown on Windows and Linux/OSX
    // See http://pm2.keymetrics.io/docs/usage/signals-clean-restart/
    if (process.platform === "win32") {
      process.on("message", msg => {
        if (msg === "shutdown") {
          this.close();
        }
      });
    } else {
      process.on("SIGINT", () => {
        this.close();
      });
    }
  }

  public init(options) {
    return env
      .init(options)
      .then(() => {
        return tableStorageManager.init();
      })
      .then(() => {
        const app = express();
        if (!env.silent) {
          app.use(morgan("dev"));
        }
        app.use(
          bodyParser.raw({
            inflate: true,
            // According to https://docs.microsoft.com/en-us/rest/api/storageservices/understanding-the-table-service-data-model
            // maximum size of an entity is 1MB
            limit: "10000kb",
            type(type) {
              return true;
            }
          })
        );
        from "./routes/table/TableRoute")(app);
        from "./routes/table/EntityRoute")(app);
        app.use(from "./middleware/table/validation"));
        app.use(from "./middleware/table/actions"));
        this.server = app.listen(env.tableStoragePort, () => {
          if (!env.silent) {
            cli.tableStorageStatus();
          }
        });
      });
  }

  public close() {
    return BbPromise.try(() => {
      this.server.close();
    });
  }
}

export default AzuriteTable;
