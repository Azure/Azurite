import express from "express";

import IAccountDataStore from "../common/IAccountDataStore";
import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import IExtentStore from "../common/persistence/IExtentStore";
import { RequestListener } from "../common/ServerBase";
import AccountSASAuthenticator from "./authentication/AccountSASAuthenticator";
import BlobSASAuthenticator from "./authentication/BlobSASAuthenticator";
import BlobSharedKeyAuthenticator from "./authentication/BlobSharedKeyAuthenticator";
import BlobTokenAuthenticator from "./authentication/BlobTokenAuthenticator";
import PublicAccessAuthenticator from "./authentication/PublicAccessAuthenticator";
import ExpressMiddlewareFactory from "./generated/ExpressMiddlewareFactory";
import IHandlers from "./generated/handlers/IHandlers";
import MiddlewareFactory from "./generated/MiddlewareFactory";
import AppendBlobHandler from "./handlers/AppendBlobHandler";
import BlobHandler from "./handlers/BlobHandler";
import BlockBlobHandler from "./handlers/BlockBlobHandler";
import ContainerHandler from "./handlers/ContainerHandler";
import PageBlobHandler from "./handlers/PageBlobHandler";
import PageBlobRangesManager from "./handlers/PageBlobRangesManager";
import ServiceHandler from "./handlers/ServiceHandler";
import AuthenticationMiddlewareFactory from "./middlewares/AuthenticationMiddlewareFactory";
import PreflightMiddlewareFactory from "./middlewares/PreflightMiddlewareFactory";
import StrictModelMiddlewareFactory, {
  UnsupportedHeadersBlocker,
  UnsupportedParametersBlocker
} from "./middlewares/StrictModelMiddlewareFactory";
import IBlobMetadataStore from "./persistence/IBlobMetadataStore";
import { DEFAULT_CONTEXT_PATH } from "./utils/constants";

import morgan = require("morgan");
import { OAuthLevel } from "../common/models";
import IAuthenticator from "./authentication/IAuthenticator";
import createStorageBlobContextMiddleware from "./middlewares/blobStorageContext.middleware";
import TelemetryMiddlewareFactory from "./middlewares/telemetry.middleware";

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
    private readonly metadataStore: IBlobMetadataStore,
    private readonly extentStore: IExtentStore,
    private readonly accountDataStore: IAccountDataStore,
    private readonly enableAccessLog: boolean,
    private readonly accessLogWriteStream?: NodeJS.WritableStream,
    private readonly loose?: boolean,
    private readonly skipApiVersionCheck?: boolean,
    private readonly oauth?: OAuthLevel,
    private readonly disableProductStyleUrl?: boolean
  ) { }

  public createRequestListener(): RequestListener {
    const app = express().disable("x-powered-by");

    // MiddlewareFactory is a factory to create auto-generated middleware
    const middlewareFactory: MiddlewareFactory = new ExpressMiddlewareFactory(
      logger,
      DEFAULT_CONTEXT_PATH
    );

    // Create handlers into handler middleware factory
    const pageBlobRangesManager = new PageBlobRangesManager();

    const loose = this.loose || false;
    const handlers: IHandlers = {
      appendBlobHandler: new AppendBlobHandler(
        this.metadataStore,
        this.extentStore,
        logger,
        loose
      ),
      blobHandler: new BlobHandler(
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        pageBlobRangesManager
      ),
      blockBlobHandler: new BlockBlobHandler(
        this.metadataStore,
        this.extentStore,
        logger,
        loose
      ),
      containerHandler: new ContainerHandler(
        this.accountDataStore,
        this.oauth,
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        this.disableProductStyleUrl
      ),
      pageBlobHandler: new PageBlobHandler(
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        pageBlobRangesManager
      ),
      serviceHandler: new ServiceHandler(
        this.accountDataStore,
        this.oauth,
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        this.disableProductStyleUrl
      )
    };

    // CORS request handling, preflight request and the corresponding actual request
    const preflightMiddlewareFactory = new PreflightMiddlewareFactory(logger);

    // Send Telemetry data
    const telemetryMiddlewareFactory = new TelemetryMiddlewareFactory(
      DEFAULT_CONTEXT_PATH);

    // Strict mode unsupported features blocker
    const strictModelMiddlewareFactory = new StrictModelMiddlewareFactory(
      logger,
      [UnsupportedHeadersBlocker, UnsupportedParametersBlocker]
    );

    /*
     * Generated middleware should follow strict orders
     * Manually created middleware can be injected into any points
     */

    // Access log per request
    if (this.enableAccessLog) {
      app.use(morgan("common", { stream: this.accessLogWriteStream }));
    }

    // Manually created middleware to deserialize feature related context which swagger doesn't know
    app.use(createStorageBlobContextMiddleware(this.skipApiVersionCheck, this.disableProductStyleUrl, this.loose));

    // Dispatch incoming HTTP request to specific operation
    app.use(middlewareFactory.createDispatchMiddleware());

    // Block unsupported features in strict mode by default
    if (this.loose === false || this.loose === undefined) {
      app.use(strictModelMiddlewareFactory.createStrictModelMiddleware());
    }

    // AuthN middleware, like shared key auth or SAS auth
    const authenticationMiddlewareFactory = new AuthenticationMiddlewareFactory(
      logger
    );
    const authenticators: IAuthenticator[] = [
      new PublicAccessAuthenticator(this.metadataStore, logger),
      new BlobSharedKeyAuthenticator(this.accountDataStore, logger),
      new AccountSASAuthenticator(
        this.accountDataStore,
        this.metadataStore,
        logger
      ),
      new BlobSASAuthenticator(
        this.accountDataStore,
        this.metadataStore,
        logger
      )
    ];
    if (this.oauth !== undefined) {
      authenticators.push(
        new BlobTokenAuthenticator(this.accountDataStore, this.oauth, logger)
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

    // CORS
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

    // Preflight
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
