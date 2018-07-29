import * as express from "express";
import { Server } from "http";

const BbPromise = require("bluebird"),
    bodyParser = require("body-parser"),
    env = require("./core/env"),
    morgan = require("morgan"),
    cli = require("./core/cli");

class AzuriteQueue {
    private server !: Server;
    constructor() {
        // Support for PM2 Graceful Shutdown on Windows and Linux/OSX
        // See http://pm2.keymetrics.io/docs/usage/signals-clean-restart/
        if (process.platform === "win32") {
            process.on("message", (msg) => {
                if (msg === "shutdown") {
                    this.close();
                }
            });
        }
        else {
            process.on("SIGINT", () => {
                this.close();
            });
        }
    }

    init(options) {
        return env.init(options)
            .then(() => {
                const app = express();
                if (!env.silent) {
                    app.use(morgan("dev"));
                }
                app.use(bodyParser.raw({
                    inflate: true,
                    limit: "10000kb",
                    type: function () {
                        return true;
                    }
                }));
                require("./routes/queue/AccountRoute")(app);
                require("./routes/queue/QueueRoute")(app);
                require("./routes/queue/MessageRoute")(app);
                app.use(require("./middleware/queue/validation"));
                app.use(require("./middleware/queue/actions"));
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