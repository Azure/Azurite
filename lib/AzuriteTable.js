/** @format */

"use strict";

const express = require("express"),
  methodOverride = require('method-override'),
  env = require("./core/env"),
  bodyParser = require("body-parser"),
  morgan = require("morgan"),
  tableStorageManager = require("./core/table/TableStorageManager"),
  cli = require("./core/cli"),
  BbPromise = require("bluebird");

class AzuriteTable {
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
            type: function(type) {
              return true;
            },
          })
        );
        app.use(methodOverride("X-HTTP-Method"));
        require("./routes/table/TableRoute")(app);
        require("./routes/table/EntityRoute")(app);
        app.use(require("./middleware/table/validation"));
        app.use(require("./middleware/table/actions"));
        this.server = app.listen(env.tableStoragePort, () => {
          if (!env.silent) {
            cli.tableStorageStatus();
          }
        });
      });
  }

  close() {
    return BbPromise.try(() => {
      this.server.close();
      tableStorageManager.flush();
      return tableStorageManager.close();
    });
  }
}

module.exports = AzuriteTable;
