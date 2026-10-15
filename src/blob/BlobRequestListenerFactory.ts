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
import createBlobAclMiddleware from "./middlewares/BlobAclMiddleware";
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
import DfsRequestListenerFactory from "./DfsRequestListenerFactory";

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
    private readonly disableProductStyleUrl?: boolean,
    private readonly enableHierarchicalNamespace: boolean = false
  ) { }

  public createRequestListener(): RequestListener {
    const app = express().disable("x-powered-by");

    // Mount DFS pipeline before the blob middleware chain.
    // DFS requests are identified by ?resource=, ?action=, or x-ms-rename-source header —
    // query params that are completely disjoint from the blob API (?comp=, ?restype=).
    const dfsRouter = new DfsRequestListenerFactory(
      this.metadataStore,
      this.extentStore,
      this.accountDataStore,
      this.oauth,
      this.enableHierarchicalNamespace,
      this.skipApiVersionCheck,
      this.disableProductStyleUrl
    ).createRouter();

    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (isDfsRequest(req, this.disableProductStyleUrl)) {
        dfsRouter(req, res, next);
      } else {
        next();
      }
    });

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
        loose,
        this.enableHierarchicalNamespace
      ),
      blobHandler: new BlobHandler(
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        pageBlobRangesManager,
        this.enableHierarchicalNamespace
      ),
      blockBlobHandler: new BlockBlobHandler(
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        this.enableHierarchicalNamespace
      ),
      containerHandler: new ContainerHandler(
        this.accountDataStore,
        this.oauth,
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        this.disableProductStyleUrl,
        this.enableHierarchicalNamespace
      ),
      pageBlobHandler: new PageBlobHandler(
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        pageBlobRangesManager,
        this.enableHierarchicalNamespace
      ),
      serviceHandler: new ServiceHandler(
        this.accountDataStore,
        this.oauth,
        this.metadataStore,
        this.extentStore,
        logger,
        loose,
        this.disableProductStyleUrl,
        this.enableHierarchicalNamespace
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

    // In --oauth acl mode, the POSIX ACLs of hierarchical namespace containers
    // also apply to Blob API requests authenticated with a Bearer token
    app.use(
      createBlobAclMiddleware(
        this.metadataStore,
        this.accountDataStore,
        logger,
        this.oauth,
        this.enableHierarchicalNamespace
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

/**
 * Whether a hostname is a production-style DFS endpoint hostname, whose second
 * label is "dfs", e.g. devstoreaccount1.dfs.localhost or
 * devstoreaccount1-secondary.dfs.core.windows.net.
 */
export function isDfsHostname(hostname: string): boolean {
  const labels = hostname.toLowerCase().split(".");
  return labels.length >= 3 && labels[0] !== "" && labels[1] === "dfs";
}

/**
 * Query parameters only used by the DFS (ADLS Gen2) REST API.
 */
const DFS_QUERY_PARAMETERS = [
  "resource",
  "action",
  "recursive",
  "paginated",
  "directory",
  "upn",
  "mode",
  "continuation",
  "forceFlag",
  "position",
  "retainUncommittedData",
  "close"
];

/**
 * Query parameters and headers only used by the Blob REST API, which always
 * select the Blob pipeline.
 */
const BLOB_QUERY_PARAMETERS = ["restype", "comp"];
const BLOB_HEADERS = ["x-ms-blob-type", "x-ms-blob-public-access"];

/**
 * Whether a request served on the blob port is a DFS (ADLS Gen2) request.
 *
 * Like Azure, a production-style URL with a DFS hostname (e.g.
 * devstoreaccount1.dfs.localhost) selects the DFS endpoint. Otherwise, as both
 * APIs share the port, only parameters and headers specific to one API select
 * it: Blob-only signals always win, and requests without any signal (e.g. a
 * plain GET, HEAD or DELETE of a path, which the DataLake SDKs also send to
 * the Blob endpoint) are Blob requests. The User-Agent is never used.
 * CORS preflight requests are answered by the Blob pipeline, which applies the
 * same CORS rules to both endpoints.
 */
export function isDfsRequest(
  req: express.Request,
  disableProductStyleUrl?: boolean
): boolean {
  const method = req.method.toUpperCase();
  if (method === "OPTIONS") {
    return false;
  }

  // DFS path leases are POST requests with x-ms-lease-action, with or without
  // ?comp=lease, while Blob API leases are PUT requests
  if (method === "POST" && req.headers["x-ms-lease-action"] !== undefined) {
    return req.query.comp === undefined || req.query.comp === "lease";
  }

  if (
    BLOB_QUERY_PARAMETERS.some(name => req.query[name] !== undefined) ||
    BLOB_HEADERS.some(name => req.headers[name] !== undefined)
  ) {
    return false;
  }

  if (!disableProductStyleUrl && isDfsHostname(req.hostname)) {
    return true;
  }

  return (
    req.headers["x-ms-rename-source"] !== undefined ||
    DFS_QUERY_PARAMETERS.some(name => req.query[name] !== undefined)
  );
}
