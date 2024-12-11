import express from "express";

import IAccountDataStore from "../common/IAccountDataStore";
import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import IExtentStore from "../common/persistence/IExtentStore";
import { RequestListener } from "../common/ServerBase";
import AccountSASAuthenticator from "./authentication/AccountSASAuthenticator";
import QueueSASAuthenticator from "./authentication/QueueSASAuthenticator";
import QueueSharedKeyAuthenticator from "./authentication/QueueSharedKeyAuthenticator";
import QueueTokenAuthenticator from "./authentication/QueueTokenAuthenticator";
import ExpressMiddlewareFactory from "./generated/ExpressMiddlewareFactory";
import IHandlers from "./generated/handlers/IHandlers";
import MiddlewareFactory from "./generated/MiddlewareFactory";
import MessageIdHandler from "./handlers/MessageIdHandler";
import MessagesHandler from "./handlers/MessagesHandler";
import QueueHandler from "./handlers/QueueHandler";
import ServiceHandler from "./handlers/ServiceHandler";
import AuthenticationMiddlewareFactory from "./middlewares/AuthenticationMiddlewareFactory";
import PreflightMiddlewareFactory from "./middlewares/PreflightMiddlewareFactory";
import { IQueueMetadataStore } from "./persistence/IQueueMetadataStore";
import { DEFAULT_QUEUE_CONTEXT_PATH } from "./utils/constants";

import morgan = require("morgan");
import { OAuthLevel } from "../common/models";
import IAuthenticator from "./authentication/IAuthenticator";
import createQueueStorageContextMiddleware from "./middlewares/queueStorageContext.middleware";
import TelemetryMiddlewareFactory from "./middlewares/telemetry.middleware";

/**
 * Default RequestListenerFactory based on express framework.
 *
 * When creating other server implementations, such as based on Koa. Should also create a NEW
 * corresponding QueueKoaRequestListenerFactory class by extending IRequestListenerFactory.
 *
 *  @export
 * @class QueueRequestListenerFactory
 * @implements {IRequestListenerFactory}
 */
export default class QueueRequestListenerFactory
  implements IRequestListenerFactory {
  public constructor(
    private readonly metadataStore: IQueueMetadataStore,
    private readonly extentStore: IExtentStore,
    private readonly accountDataStore: IAccountDataStore,
    private readonly enableAccessLog: boolean,
    private readonly accessLogWriteStream?: NodeJS.WritableStream,
    private readonly skipApiVersionCheck?: boolean,
    private readonly oauth?: OAuthLevel,
    private readonly disableProductStyleUrl?: boolean
  ) {}

  public createRequestListener(): RequestListener {
    const app = express().disable("x-powered-by");

    // MiddlewareFactory is a factory to create auto-generated middleware
    const middlewareFactory: MiddlewareFactory = new ExpressMiddlewareFactory(
      logger,
      DEFAULT_QUEUE_CONTEXT_PATH
    );
    
    // Send Telemetry data
    const telemetryMiddlewareFactory = new TelemetryMiddlewareFactory(
      DEFAULT_QUEUE_CONTEXT_PATH);

    // Create handlers into handler middleware factory
    const handlers: IHandlers = {
      serviceHandler: new ServiceHandler(
        this.metadataStore,
        this.extentStore,
        logger
      ),
      queueHandler: new QueueHandler(
        this.metadataStore,
        this.extentStore,
        logger
      ),
      messagesHandler: new MessagesHandler(
        this.metadataStore,
        this.extentStore,
        logger
      ),
      messageIdHandler: new MessageIdHandler(
        this.metadataStore,
        this.extentStore,
        logger
      )
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
    app.use(createQueueStorageContextMiddleware(this.skipApiVersionCheck, this.disableProductStyleUrl));

    // Dispatch incoming HTTP request to specific operation
    app.use(middlewareFactory.createDispatchMiddleware());

    // AuthN middleware, like shared key auth or SAS auth
    const authenticationMiddlewareFactory = new AuthenticationMiddlewareFactory(
      logger
    );
    const authenticators: IAuthenticator[] = [
      new QueueSharedKeyAuthenticator(this.accountDataStore, logger),
      new AccountSASAuthenticator(this.accountDataStore, logger),
      new QueueSASAuthenticator(
        this.accountDataStore,
        this.metadataStore,
        logger
      )
    ];
    if (this.oauth !== undefined) {
      authenticators.push(
        new QueueTokenAuthenticator(this.accountDataStore, this.oauth, logger)
      );
    }
    app.use(
      authenticationMiddlewareFactory.createAuthenticationMiddleware(
        authenticators
      )
    );

    // Generated, will do basic validation defined in swagger
    app.use(middlewareFactory.createDeserializerMiddleware());

    // Generated, inject handlers to create a handler middleware
    app.use(middlewareFactory.createHandlerMiddleware(handlers));

    // CORS request handling, preflight request and the corresponding actual request
    const preflightMiddlewareFactory = new PreflightMiddlewareFactory(logger);
    // CORS actual request handling.
    // tslint:disable-next-line:max-line-length
    // See as https://docs.microsoft.com/en-us/rest/api/storageservices/cross-origin-resource-sharing--cors--support-for-the-azure-storage-services
    app.use(
      preflightMiddlewareFactory.createCorsRequestMiddleware(
        this.metadataStore,
        true
      )
    );
    app.use(
      preflightMiddlewareFactory.createCorsRequestMiddleware(
        this.metadataStore,
        false
      )
    );

    // Generated, will serialize response models into HTTP response
    app.use(middlewareFactory.createSerializerMiddleware());

    // CORS preflight request handling, processing OPTIONS requests.
    // TODO: Should support OPTIONS in swagger and autorest, then this handling can be moved to ServiceHandler.
    app.use(
      preflightMiddlewareFactory.createOptionsHandlerMiddleware(
        this.metadataStore
      )
    );

    // Generated, will return MiddlewareError and Errors thrown in previous middleware/handlers to HTTP response
    app.use(middlewareFactory.createErrorMiddleware());

    // Send out telemetry data
    app.use(telemetryMiddlewareFactory.createTelemetryMiddleware());

    // Generated, will end and return HTTP response immediately
    app.use(middlewareFactory.createEndMiddleware());

    return app;
  }
}
