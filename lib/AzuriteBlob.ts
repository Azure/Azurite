import * as express from "express";
import { Server } from "http";

const BbPromise = require("bluebird"),
  bodyParser = require("body-parser"),
  env = require("./core/env"),
  storageManager = require("./core/blob/StorageManager"),
  morgan = require("morgan"),
  cli = require("./core/cli");

class AzuriteBlob {
  server!: Server;
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

  init(options) {
    return env
      .init(options)
      .then(() => {
        return storageManager.init();
      })
      .then(() => {
        const app = express();
        if (!env.silent) {
          app.use(morgan("dev"));
        }
        // According to RFC 7231:
        // An origin server MAY respond with a status code of 415 (Unsupported
        // Media Type) if a representation in the request message has a content
        // coding that is not acceptable.
        // body-parser, however, throws an error. We thus ignore unsupported content encodings and treat them as 'identity'.
        app.use(
          (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
          ) => {
            const encoding = (
              req.headers["content-encoding"] || "identity"
            ).toLowerCase();
            let deleteHeader = false;

            if (encoding === "deflate") {
              deleteHeader = true;
            }

            if (encoding !== "gzip") {
              deleteHeader = true;
            }
            if (encoding !== "identity") {
              deleteHeader = true;
            }

            if (deleteHeader) {
              delete req.headers["content-encoding"];
            }

            next();
          }
        );
        app.use(
          bodyParser.raw({
            inflate: true,
            limit: "268435kb", // Maximum size of a single PUT Blob operation as per spec.
            type: function(type) {
              return true;
            }
          })
        );
        app.use(`/blobs`, express.static(env.localStoragePath));
        require("./routes/blob/AccountRoute")(app);
        require("./routes/blob/ContainerRoute")(app);
        require("./routes/blob/BlobRoute")(app);
        require("./routes/blob/NotFoundRoute")(app);
        app.use(require("./middleware/blob/cors"));
        app.use(require("./middleware/blob/authentication"));
        app.use(require("./middleware/blob/validation"));
        app.use(require("./middleware/blob/actions"));
        this.server = app.listen(env.blobStoragePort, () => {
          if (!env.silent) {
            cli.blobStorageStatus();
          }
        });
      });
  }

  close() {
    return BbPromise.try(() => {
      this.server.close();
      storageManager.flush();
      return storageManager.close();
    });
  }
}

export default AzuriteBlob;
