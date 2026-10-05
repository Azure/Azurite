import * as crypto from "node:crypto";

import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response
} from "express";

import logger from "../../../common/Logger";
import MemoryExtentStore, {
  SharedChunkStore
} from "../../../common/persistence/MemoryExtentStore";
import LokiExtentMetadataStore from "../../../common/persistence/LokiExtentMetadataStore";
import StorageError from "../../errors/StorageError";
import MessageIdHandler from "../../handlers/MessageIdHandler";
import MessagesHandler from "../../handlers/MessagesHandler";
import QueueHandler from "../../handlers/QueueHandler";
import ServiceHandler from "../../handlers/ServiceHandler";
import createQueueStorageContextMiddleware from "../../middlewares/queueStorageContext.middleware";
import errorMiddleware from "../../generated/middleware/error.middleware";
import endMiddleware from "../../generated/middleware/end.middleware";
import ExpressRequestAdapter from "../../generated/ExpressRequestAdapter";
import ExpressResponseAdapter from "../../generated/ExpressResponseAdapter";
import QueueStorageContext from "../../context/QueueStorageContext";
import { DEFAULT_QUEUE_CONTEXT_PATH } from "../../utils/constants";
import LokiQueueMetadataStore from "../../persistence/LokiQueueMetadataStore";
import {
  createPilotDispatchMiddleware,
  type RealHandlers
} from "./pilotDispatchMiddleware";

/**
 * Wires the pilot emitter's generated metadata-driven dispatch middleware
 * (`pilotDispatchMiddleware.ts`) together with Azurite's REAL, unmodified pieces - persistence
 * stores (`LokiQueueMetadataStore`/`LokiExtentMetadataStore`/`MemoryExtentStore`, in-memory mode,
 * constructed the same way `src/queue/QueueServer.ts` does, minus the full HTTP-listener/GC
 * machinery this pilot doesn't need), the real `QueueHandler`/`ServiceHandler`/
 * `MessagesHandler`/`MessageIdHandler` business-logic classes, the real
 * `createQueueStorageContextMiddleware` (account/queue/message/messageId + dispatchPattern
 * parsing), and the real `error.middleware.ts` - into one Express app. This is deliberately NOT a
 * parallel reimplementation: every piece except the dispatch middleware itself is the exact same
 * code Azurite's production Queue server (`QueueServer.ts`/`QueueRequestListenerFactory.ts`)
 * uses today.
 *
 * Deliberately out of scope for this pilot server (see package README): authentication (no
 * `AccountDataStore`/auth middleware is wired - every request is treated as already
 * authenticated, same simplification many Azurite test harnesses make), CORS, access logging,
 * and the `-secondary` endpoint suffix for secondary-region reads.
 */
export async function createPilotServer(): Promise<Express> {
  const metadataStore = new LokiQueueMetadataStore(":memory:", true);
  const extentMetadataStore = new LokiExtentMetadataStore(":memory:", true);
  const extentStore = new MemoryExtentStore(
    "queue",
    SharedChunkStore,
    extentMetadataStore,
    logger,
    (statusCode, storageErrorCode, storageErrorMessage, storageRequestId) =>
      new StorageError(
        statusCode,
        storageErrorCode,
        storageErrorMessage,
        storageRequestId
      )
  );

  await metadataStore.init();
  await extentMetadataStore.init();
  await extentStore.init();

  const handlers: RealHandlers = {
    service: new ServiceHandler(metadataStore, extentStore, logger),
    queue: new QueueHandler(metadataStore, extentStore, logger),
    messages: new MessagesHandler(metadataStore, extentStore, logger),
    messageId: new MessageIdHandler(metadataStore, extentStore, logger)
  };

  const app = express();
  app.use(express.json());
  app.use(createQueueStorageContextMiddleware());
  app.use(createPilotDispatchMiddleware(handlers));

  // No generated operation matched: behave like a real 404 rather than falling through silently.
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "No operation matched this request" });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const context = new QueueStorageContext(
      res.locals,
      DEFAULT_QUEUE_CONTEXT_PATH
    );
    if (context.contextID === undefined) {
      context.contextID = crypto.randomUUID();
    }
    const responseAdapter = new ExpressResponseAdapter(res);
    errorMiddleware(
      context,
      err as Error,
      new ExpressRequestAdapter(req),
      responseAdapter,
      () => undefined,
      logger
    );
    // Real Azurite's pipeline always runs `end.middleware.ts` last to close out the response
    // stream (`error.middleware.ts` itself only ever calls `.write()`, never `.end()`) - reuse it
    // unchanged here too, rather than leaving every error response hanging.
    endMiddleware(context, responseAdapter, logger);
  });

  return app;
}
