/** @format */

"use strict";

import express from 'express';
import env from './core/env';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import cli from './core/cli';
import BbPromise from 'bluebird';
import routes from "./routes/queue/AccountRoute";
import routes0 from "./routes/queue/QueueRoute";
import routes01 from "./routes/queue/MessageRoute";
import middleware from "./middleware/queue/validation";
import middleware0 from "./middleware/queue/actions";

class AzuriteQueue {
  constructor() {
    this.server;
    // Support for PM2 Graceful Shutdown on Windows and Linux/OSX
    // See http://pm2.keymetrics.io/docs/usage/signals-clean-restart/
    if (process.platform === "win32") {
      process.on("message", function(msg) {
        if (msg == "shutdown") {
          this.close();
        }
      });
    } else {
      process.on("SIGINT", function() {
        this.close();
      });
    }
  }

  init(options) {
    return env.init(options).then(() => {
      const app = express();
      if (!env.silent) {
        app.use(morgan("dev"));
      }
      app.use(
        bodyParser.raw({
          inflate: true,
          limit: "10000kb",
          type: function(type) {
            return true;
          },
        })
      );
      routes(app);
      routes0(app);
      routes01(app);
      app.use(middleware);
      app.use(middleware0);
      this.server = app.listen(env.queueStoragePort, () => {
        if (!env.silent) {
          cli.queueStorageStatus();
        }
      });
    });
  }

  close() {
    return BbPromise.try(() => {
      this.server.close();
    });
  }
}

export default AzuriteQueue;
