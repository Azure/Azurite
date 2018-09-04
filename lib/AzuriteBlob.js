/** @format */

"use strict";

import BbPromise from 'bluebird';
import express from 'express';
import bodyParser from 'body-parser';
import env from './core/env';
import storageManager from './core/blob/StorageManager';
import morgan from 'morgan';
import cli from './core/cli';

import routes from "./routes/blob/AccountRoute";

import routes0 from "./routes/blob/ContainerRoute";

import routes01 from "./routes/blob/BlobRoute";

import routes012 from "./routes/blob/NotFoundRoute";

import middleware from "./middleware/blob/cors";

import middleware0 from "./middleware/blob/authentication";

import middleware01 from "./middleware/blob/validation";

import middleware012 from "./middleware/blob/actions";

class AzuriteBlob {
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
        app.use((req, res, next) => {
          const encoding = (
            req.headers["content-encoding"] || "identity"
          ).toLowerCase();
          if (
            encoding !== "deflate" ||
            encoding !== "gzip" ||
            encoding !== "identity"
          ) {
            delete req.headers["content-encoding"];
          }
          next();
        });
        app.use(
          bodyParser.raw({
            inflate: true,
            limit: "268435kb", // Maximum size of a single PUT Blob operation as per spec.
            type: function(type) {
              return true;
            },
          })
        );
        app.use(`/blobs`, express.static(env.localStoragePath));
        routes(app);
        routes0(app);
        routes01(app);
        routes012(app);
        app.use(middleware);
        app.use(middleware0);
        app.use(middleware01);
        app.use(middleware012);
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
