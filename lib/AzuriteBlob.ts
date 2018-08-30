/** @format */

import BbPromise from 'bluebird';
import express from 'express';
import bodyParser from 'body-parser';
import env from './core/env';
import storageManager from './core/blob/StorageManager';
import morgan from 'morgan';
import * as cli from './core/cli';
import AccountRoute from './routes/blob/AccountRoute';
import ContainerRoute from './routes/blob/ContainerRoute';
import BlobRoute from './routes/blob/BlobRoute';
import NotFoundRoute from './routes/blob/NotFoundRoute';
import cors from './middleware/blob/cors';
import authentication from './middleware/blob/authentication';
import validation from './middleware/blob/validation';
import actions from './middleware/blob/actions';

class AzuriteBlob {
    server: any;
    constructor() {
        this.server;
        // Support for PM2 Graceful Shutdown on Windows and Linux/OSX
        // See http://pm2.keymetrics.io/docs/usage/signals-clean-restart/
        if (process.platform === 'win32') {
            process.on('message', function (msg) {
                if (msg == 'shutdown') {
                    this.close();
                }
            });
        }
        else {
            process.on('SIGINT', function () {
                this.close();
            });
        }
    }

    init(options) {
        return env.init(options)
            .then(() => {
                return storageManager.init()
            })
            .then(() => {
                const app = express();
                if (!env.silent) {
                    app.use(morgan('dev'));
                }
                // According to RFC 7231:
                // An origin server MAY respond with a status code of 415 (Unsupported
                // Media Type) if a representation in the request message has a content
                // coding that is not acceptable.
                // body-parser, however, throws an error. We thus ignore unsupported content encodings and treat them as 'identity'.
                app.use((req, res, next) => {
                    const encoding = (req.headers['content-encoding'] || 'identity').toLowerCase();
                    if (encoding !== 'deflate' ||
                        encoding !== 'gzip' ||
                        encoding !== 'identity') {
                        delete req.headers['content-encoding'];
                    }
                    next();
                })
                app.use(bodyParser.raw({
                    inflate: true,
                    limit: '268435kb', // Maximum size of a single PUT Blob operation as per spec.
                    type: function (type) {
                        return true;
                    }
                }));
                app.use(`/blobs`, express.static(env.localStoragePath));
                AccountRoute(app);
                ContainerRoute(app);
                BlobRoute(app);
                NotFoundRoute(app);
                app.use(cors);
                app.use(authentication);
                app.use(validation);
                app.use(actions);
                this.server = app.listen(env.blobStoragePort, () => {
                    if (!env.silent) {
                        cli.blobStorageStatus();
                    }
                });
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
