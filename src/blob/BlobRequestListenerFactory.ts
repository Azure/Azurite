import express from "express";
import morgan = require("morgan");

import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import { RequestListener } from "../common/ServerBase";
import blobStorageContextMiddleware from "./context/blobStorageContext.middleware";
import ExpressMiddlewareFactory from "./generated/ExpressMiddlewareFactory";
import IHandlers from "./generated/handlers/IHandlers";
import MiddlewareFactory from "./generated/MiddlewareFactory";
import AppendBlobHandler from "./handlers/AppendBlobHandler";
import BlobHandler from "./handlers/BlobHandler";
import BlockBlobHandler from "./handlers/BlockBlobHandler";
import ContainerHandler from "./handlers/ContainerHandler";
import PageBlobHandler from "./handlers/PageBlobHandler";
import ServiceHandler from "./handlers/ServiceHandler";
import { IBlobDataStore } from "./persistence/IBlobDataStore";
import { DEFAULT_CONTEXT_PATH } from "./utils/constants";

/**
 * Default RequestListenerFactory based on express framework.
 *
 * When creating other server implementations, such as based on Koa. Should also create a NEW
 * corresponding BlobKoaRequestListenerFactory class by extending IRequestListenerFactory.
 *
 * @export
 * @class BlobRequestListenerFactory
 * @implements {IRequestListenerFactory}
 */
export default class BlobRequestListenerFactory
  implements IRequestListenerFactory {
  public constructor(
    private readonly dataStore: IBlobDataStore,
    private readonly enableAccessLog: boolean
  ) {}

  public createRequestListener(): RequestListener {
    const app = express().disable("x-powered-by");

    // MiddlewareFactory is a factory to create auto-generated middleware
    const middlewareFactory: MiddlewareFactory = new ExpressMiddlewareFactory(
      logger,
      DEFAULT_CONTEXT_PATH
    );

    // Create handlers into handler middleware factory
    const handlers: IHandlers = {
      appendBlobHandler: new AppendBlobHandler(this.dataStore, logger),
      blobHandler: new BlobHandler(this.dataStore, logger),
      blockBlobHandler: new BlockBlobHandler(this.dataStore, logger),
      containerHandler: new ContainerHandler(this.dataStore, logger),
      pageBlobHandler: new PageBlobHandler(this.dataStore, logger),
      serviceHandler: new ServiceHandler(this.dataStore, logger)
    };

    /*
     * Generated middleware should follow strict orders
     * Manually created middleware can be injected into any points
     */

    // Access log per request
    if (this.enableAccessLog) {
      app.use(morgan("common"));
    }

    // Manually created middleware to deserialize feature related context which swagger doesn't know
    app.use(blobStorageContextMiddleware);

    // Dispatch incoming HTTP request to specific operation
    // Emulator's URL pattern is like http://hostname:port/account/container
    // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
    // Exclude account name from req.path for dispatchMiddleware
    app.use(
      "/:account",
      express.Router().use(middlewareFactory.createDispatchMiddleware())
    );

    // TODO: AuthN middleware, like shared key auth or SAS auth

    // Generated, will do basic validation defined in swagger
    app.use(middlewareFactory.createDeserializerMiddleware());

    // Generated, inject handlers to create a handler middleware
    app.use(middlewareFactory.createHandlerMiddleware(handlers));

    // Generated, will serialize response models into HTTP response
    app.use(middlewareFactory.createSerializerMiddleware());

    // Generated, will return MiddlewareError and Errors thrown in previous middleware/handlers to HTTP response
    app.use(middlewareFactory.createErrorMiddleware());

    // Generated, will end and return HTTP response immediately
    app.use(middlewareFactory.createEndMiddleware());

    return app;
  }
}
