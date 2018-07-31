import * as BbPromise from "bluebird";
import * as bodyParser from "body-parser";
import * as express from "express";
import { Server } from "http";
import * as morgan from "morgan";
import { tableStorageStatus } from "./core/cli";
import Environment from "./core/env";
import tableStorageManager from "./core/table/TableStorageManager";
import Actions from "./middleware/queue/actions";
import Validation from "./middleware/queue/validation";
import EntityRoute from "./routes/table/EntityRoute";
import TableRoute from "./routes/table/TableRoute";

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
    return Environment.init(options)
      .then(() => {
        return tableStorageManager.init();
      })
      .then(() => {
        const app = express();
        if (!Environment.silent) {
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
        EntityRoute(app);
        TableRoute(app);
        app.use(Validation);
        app.use(Actions);
        this.server = app.listen(Environment.tableStoragePort, () => {
          if (!Environment.silent) {
            tableStorageStatus();
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
