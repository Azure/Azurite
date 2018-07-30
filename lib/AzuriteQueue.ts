import * as BbPromise from "bluebird";
import * as bodyParser from "body-parser";
import * as express from "express";
import { Server } from "http";
import * as morgan from "morgan";
import { queueStorageStatus } from "./core/cli";
import env from "./core/env";
import Actions from "./middleware/queue/actions";
import Validation from "./middleware/queue/validation";
import AccountRoute from "./routes/queue/AccountRoute";
import MessageRoute from "./routes/queue/MessageRoute";
import QueueRoute from "./routes/queue/QueueRoute";

class AzuriteQueue {
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
    return env.init(options).then(() => {
      const app = express();
      if (!env.silent) {
        app.use(morgan("dev"));
      }
      app.use(
        bodyParser.raw({
          inflate: true,
          limit: "10000kb",
          type() {
            return true;
          }
        })
      );
      AccountRoute(app);
      QueueRoute(app);
      MessageRoute(app);
      app.use(Validation);
      app.use(Actions);
      this.server = app.listen(env.queueStoragePort, () => {
        if (!env.silent) {
          queueStorageStatus();
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

export default AzuriteQueue;
