import * as BbPromise from "bluebird";
import * as bodyParser from "body-parser";
import * as express from "express";
import { Server } from "http";
import * as morgan from "morgan";
import storageManager from "../lib/core/blob/StorageManager";
import { blobStorageStatus } from "./core/cli";
import Environment from "./core/env";
import Actions from "./middleware/blob/actions";
import Authentication from "./middleware/blob/authentication";
import Cors from "./middleware/blob/cors";
import Validation from "./middleware/blob/validation";
import AccountRoute from "./routes/blob/AccountRoute";
import BlobRoute from "./routes/blob/BlobRoute";
import ContainerRoute from "./routes/blob/ContainerRoute";
import NotFoundRoute from "./routes/blob/NotFoundRoute";

class AzuriteBlob {
  public server!: Server;
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
        return storageManager.init();
      })
      .then(() => {
        const app = express();
        if (!Environment.silent) {
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
            type() {
              return true;
            }
          })
        );
        app.use(`/blobs`, express.static(Environment.localStoragePath));
        AccountRoute(app);
        ContainerRoute(app);
        BlobRoute(app);
        NotFoundRoute(app);
        app.use(Cors);
        app.use(Authentication);
        app.use(Validation);
        app.use(Actions);

        this.server = app.listen(Environment.blobStoragePort, () => {
          if (!Environment.silent) {
            blobStorageStatus();
          }
        });
      });
  }

  public close() {
    return BbPromise.try(() => {
      this.server.close();
      storageManager.flush();
      return storageManager.close();
    });
  }
}

export default AzuriteBlob;
