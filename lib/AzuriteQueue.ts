import * as express from "express";
import { Server } from "http";

const BbPromise = from "bluebird"),
  bodyParser = from "body-parser"),
  env = from "./core/env"),
  morgan = from "morgan"),
  cli = from "./core/cli");

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
      from "./routes/queue/AccountRoute")(app);
      from "./routes/queue/QueueRoute")(app);
      from "./routes/queue/MessageRoute")(app);
      app.use(from "./middleware/queue/validation"));
      app.use(from "./middleware/queue/actions"));
      this.server = app.listen(env.queueStoragePort, () => {
        if (!env.silent) {
          cli.queueStorageStatus();
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
