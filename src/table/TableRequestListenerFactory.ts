import express from "express";
import { RequestListener } from "http";

import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";

import ITableMetadataStore from "./persistence/ITableMetadataStore";
import { DEFAULT_TABLE_CONTEXT_PATH } from "./utils/constants";
import TableHandler from "./handlers/TableHandler";
import ServiceHandler from "./handlers/ServiceHandler";
import createTableStorageContextMiddleware from "./middleware/tableStorageContext.middleware";

import morgan = require("morgan");

// Generated
import ExpressMiddlewareFactory from "./generated/ExpressMiddlewareFactory";
import MiddlewareFactory from "./generated/MiddlewareFactory";
import IHandlers from "./generated/handlers/IHandlers";

/**
 * Default RequestListenerFactory based on express framework.
 *
 * When creating other server implementations, such as based on Koa. Should also create a NEW
 * corresponding TableKoaRequestListenerFactory class by extending IRequestListenerFactory.
 *
 *  @export
 * @class TableRequestListenerFactory
 * @implements {IRequestListenerFactory}
 */
export default class TableRequestListenerFactory
  implements IRequestListenerFactory {
  public constructor(
    private readonly metadataStore: ITableMetadataStore,
    private readonly enableAccessLog: boolean,
    private readonly accessLogWriteStream?: NodeJS.WritableStream
  ) // private readonly skipApiVersionCheck?: boolean,
  {}

  public createRequestListener(): RequestListener {
    const app = express().disable("x-powered-by");

    // MiddlewareFactory is a factory to create auto-generated middleware
    const middlewareFactory: MiddlewareFactory = new ExpressMiddlewareFactory(
      logger,
      DEFAULT_TABLE_CONTEXT_PATH
    );

    // Create handlers into handler middleware factory
    const handlers: IHandlers = {
      tableHandler: new TableHandler(this.metadataStore, logger),
      serviceHandler: new ServiceHandler(this.metadataStore, logger)
    };

    /*
     * Generated middleware should follow strict orders
     * Manually created middleware can be injected into any points
     */

    // Access log per request
    if (this.enableAccessLog) {
      app.use(morgan("common", { stream: this.accessLogWriteStream }));
    }

    // Manually created middleware to deserialize feature related context which swagger doesn't know
    app.use(createTableStorageContextMiddleware());

    // Dispatch incoming HTTP request to specific operation
    app.use(middlewareFactory.createDispatchMiddleware());

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
