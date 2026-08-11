import { OperationSpec } from "@azure/ms-rest-js/es/lib/operationSpec";
import express from "express";
import { RequestListener } from "http";
import IAccountDataStore from "../common/IAccountDataStore";
import IRequestListenerFactory from "../common/IRequestListenerFactory";
import logger from "../common/Logger";
import AccountSASAuthenticator from "./authentication/AccountSASAuthenticator";
import IAuthenticator from "./authentication/IAuthenticator";
import TableSASAuthenticator from "./authentication/TableSASAuthenticator";
import TableTokenAuthenticator from "./authentication/TableTokenAuthenticator";
import { TableQueryResponse } from "./generated/artifacts/mappers";
import { Operation } from "./generated/artifacts/operation";
import Specifications from "./generated/artifacts/specifications";
import ExpressMiddlewareFactory from "./generated/ExpressMiddlewareFactory";
import IHandlers from "./generated/handlers/IHandlers";
import MiddlewareFactory from "./generated/MiddlewareFactory";
import ServiceHandler from "./handlers/ServiceHandler";
import TableHandler from "./handlers/TableHandler";
import AuthenticationMiddlewareFactory from "./middleware/AuthenticationMiddlewareFactory";
import createTableStorageContextMiddleware from "./middleware/tableStorageContext.middleware";
import ITableMetadataStore from "./persistence/ITableMetadataStore";
import { DEFAULT_TABLE_CONTEXT_PATH } from "./utils/constants";
import PreflightMiddlewareFactory from "./middleware/PreflightMiddlewareFactory";

import morgan = require("morgan");
import { OAuthLevel } from "../common/models";
import TableSharedKeyAuthenticator from "./authentication/TableSharedKeyAuthenticator";
import TableSharedKeyLiteAuthenticator from "./authentication/TableSharedKeyLiteAuthenticator";
import TelemetryMiddlewareFactory from "./middleware/telemetry.middleware";
/**
 * Default RequestListenerFactory based on express framework.
 *
 * When creating other server implementations, such as based on Koa. Should also create a NEW
 * corresponding TableKoaRequestListenerFactory class by extending IRequestListenerFactory.
 *
 * @export
 * @class TableRequestListenerFactory
 * @implements {IRequestListenerFactory}
 */
export default class TableRequestListenerFactory
  implements IRequestListenerFactory {
  public constructor(
    private readonly metadataStore: ITableMetadataStore,
    private readonly accountDataStore: IAccountDataStore,
    private readonly enableAccessLog: boolean,
    private readonly accessLogWriteStream?: NodeJS.WritableStream,
    private readonly skipApiVersionCheck?: boolean,
    private readonly oauth?: OAuthLevel,
    private readonly disableProductStyleUrl?: boolean
  ) {}

  public createRequestListener(): RequestListener {
    // TODO: Workarounds for generated specification isXML issue. Ideally should fix in generator.
    type MutableSpecification = {
      -readonly [K in keyof OperationSpec]: OperationSpec[K];
    };
    [
      Operation.Table_Create,
      Operation.Table_Query,
      Operation.Table_Delete,
      Operation.Table_QueryEntities,
      Operation.Table_QueryEntitiesWithPartitionAndRowKey,
      Operation.Table_UpdateEntity,
      Operation.Table_MergeEntity,
      Operation.Table_DeleteEntity,
      Operation.Table_InsertEntity
    ].forEach((operation) => {
      (Specifications[operation] as MutableSpecification).isXML = false;
    });

    // TODO: MERGE verbs is not supported by auto generator yet,
    //    So there we generate a post method and change the verb for MERGE here
    Object.defineProperty(
      Specifications[Operation.Table_MergeEntityWithMerge],
      "httpMethod",
      {
        value: "MERGE",
        writable: false
      }
    );

    // TODO: Override Query Table JSON response element value
    TableQueryResponse.type.modelProperties!.value.xmlElementName = "value";
    const app = express().disable("x-powered-by");

    // MiddlewareFactory is a factory to create auto-generated middleware
    const middlewareFactory: MiddlewareFactory = new ExpressMiddlewareFactory(
      logger,
      DEFAULT_TABLE_CONTEXT_PATH
    );
    
    // Send Telemetry data
    const telemetryMiddlewareFactory = new TelemetryMiddlewareFactory(
      DEFAULT_TABLE_CONTEXT_PATH);

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
      app.use(
        morgan("common", {
          stream: this.accessLogWriteStream
        })
      );
    }

    // Manually created middleware to deserialize feature related context which swagger doesn't know
    app.use(createTableStorageContextMiddleware(this.skipApiVersionCheck, this.disableProductStyleUrl));

    // Dispatch incoming HTTP request to specific operation
    app.use(middlewareFactory.createDispatchMiddleware());

    // AuthN middleware, like shared key auth or SAS auth
    const authenticationMiddlewareFactory = new AuthenticationMiddlewareFactory(
      logger
    );
    const authenticators: IAuthenticator[] = [
      new TableSharedKeyLiteAuthenticator(this.accountDataStore, logger),
      new TableSharedKeyAuthenticator(this.accountDataStore, logger),
      new AccountSASAuthenticator(this.accountDataStore, logger),
      new TableSASAuthenticator(
        this.accountDataStore,
        this.metadataStore,
        logger
      )
    ];
    if (this.oauth !== undefined) {
      authenticators.push(
        new TableTokenAuthenticator(this.accountDataStore, this.oauth, logger)
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
