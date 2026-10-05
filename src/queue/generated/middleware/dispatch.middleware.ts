import Operation from "../artifacts/operation";
import Context from "../Context";
import UnsupportedRequestError from "../errors/UnsupportedRequestError";
import IRequest from "../IRequest";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import type { OperationMetadata } from "../../typespecPilot/generated/operations";
import { operations } from "../../typespecPilot/generated/operations";

/**
 * Pilot replacement for the AutoRest-generated dispatch middleware.
 *
 * This is the ONLY file in Azurite's real Queue request pipeline this pilot modifies: see
 * `src/queue/typespecPilot/README.md` for why `dispatch.middleware.ts` is the sole safe,
 * meaningful integration point (its only job is choosing a `context.operation` value; it does
 * no body/header (de)serialization, which is still driven entirely by the real,
 * AutoRest-generated `Specifications`/`Mappers` keyed by that same `Operation` enum).
 *
 * Routing here is driven by `@azure-tools/typespec-azurite-emitter`'s generated
 * `operations.ts` metadata (name/verb/path/parameters/`interfaceName`) rather than the real
 * `msRest.OperationSpec`/`Mappers` shapes the original implementation used - proving that
 * metadata is sufficient to drive real dispatch.
 */

/**
 * Maps our generated operation names (from the vendored, unmodified Storage Queue TypeSpec) to
 * Azurite's own legacy `Operation` enum. This mapping is unavoidably Azurite-specific glue: the
 * enum itself is Azurite's own AutoRest-era artifact that the emitter doesn't and shouldn't know
 * about, so it cannot be derived generically from the generated metadata.
 *
 * `GetUserDelegationKey` is intentionally omitted: Azurite has no `Operation` enum member and no
 * handler implementation for this operation today (confirmed against
 * `src/queue/generated/artifacts/operation.ts` and `src/queue/handlers/ServiceHandler.ts` as of
 * this writing) - a genuine, pre-existing gap in Azurite's own Queue support that the vendored
 * spec surfaces, not a bug in the emitter or this patch. Requests for it correctly fall through
 * to `UnsupportedRequestError` below, matching today's real behavior.
 */
const OPERATION_NAME_TO_REAL_ENUM: Readonly<Record<string, Operation>> = {
  SetProperties: Operation.Service_SetProperties,
  GetProperties: Operation.Service_GetProperties,
  GetStatistics: Operation.Service_GetStatistics,
  GetQueues: Operation.Service_ListQueuesSegment,
  Create: Operation.Queue_Create,
  Delete: Operation.Queue_Delete,
  QueueGetProperties: Operation.Queue_GetProperties,
  SetMetadata: Operation.Queue_SetMetadata,
  GetAccessPolicy: Operation.Queue_GetAccessPolicy,
  SetAccessPolicy: Operation.Queue_SetAccessPolicy,
  ReceiveMessages: Operation.Messages_Dequeue,
  Clear: Operation.Messages_Clear,
  SendMessage: Operation.Messages_Enqueue,
  PeekMessages: Operation.Messages_Peek,
  UpdateMessage: Operation.MessageId_Update,
  DeleteMessage: Operation.MessageId_Delete,
};

/** The queue-relative path with any embedded literal disambiguating query string (e.g.
 * `"?restype=service&comp=properties"`) split off, plus the parsed literal query pairs. */
function splitPathAndLiteralQuery(path: string): {
  pathOnly: string;
  literalQuery: URLSearchParams;
} {
  const [pathOnly, query = ""] = path.split("?", 2);
  return { pathOnly: pathOnly || "/", literalQuery: new URLSearchParams(query) };
}

/**
 * Classifies an operation into one of the 4 literal dispatch buckets
 * `queueStorageContext.middleware.ts` already computes for every real request
 * (`context.dispatchPattern`), generically from the generated metadata:
 *   - `interfaceName === "Service"` (account-level operations) -> `"/"`
 *   - everything else (`interfaceName === "Queue"`, covering queue/messages/message-id
 *     operations in this spec) is further distinguished by the queue-relative path shape.
 *
 * This replaces what would otherwise be a hardcoded per-operation-name bucket table: the only
 * generic input needed beyond the path itself is `interfaceName`, which the emitter now emits
 * precisely so dispatchers don't have to guess resource identity from `name`/`path` alone.
 */
function dispatchBucketFor(op: OperationMetadata): string {
  if (op.interfaceName === "Service") {
    return "/";
  }
  const { pathOnly } = splitPathAndLiteralQuery(op.path);
  if (pathOnly === "/") {
    return "/queue";
  }
  if (pathOnly === "/messages") {
    return "/queue/messages";
  }
  if (pathOnly.startsWith("/messages/")) {
    return "/queue/messages/messageId";
  }
  return pathOnly;
}

interface RoutableOperation {
  readonly metadata: OperationMetadata;
  readonly realOperation: Operation;
  readonly bucket: string;
  readonly literalQuery: URLSearchParams;
}

const ROUTABLE_OPERATIONS: readonly RoutableOperation[] = operations
  .filter((op) => OPERATION_NAME_TO_REAL_ENUM[op.name] !== undefined)
  .map((op) => {
    const { literalQuery } = splitPathAndLiteralQuery(op.path);
    return {
      metadata: op,
      realOperation: OPERATION_NAME_TO_REAL_ENUM[op.name],
      bucket: dispatchBucketFor(op),
      literalQuery,
    };
  });

/** Required (non-optional) query parameters our generated metadata records for an operation,
 * excluding the bucket-disambiguating literal query pairs already captured in `literalQuery`
 * (those are validated separately, by exact value, not just by presence). */
function requiredDynamicQueryParamNames(op: OperationMetadata): readonly string[] {
  return op.parameters.filter((p) => p.location === "query" && p.required).map((p) => p.wireName);
}

function matchResult(
  req: IRequest,
  candidate: RoutableOperation,
  dispatchPattern?: string
): number | undefined {
  const xHttpMethod = req.getHeader("X-HTTP-Method");
  let method = req.getMethod();
  if (xHttpMethod && xHttpMethod.length > 0) {
    const value = xHttpMethod.trim();
    if (value === "GET" || value === "MERGE" || value === "PATCH" || value === "DELETE") {
      method = value;
    }
  }

  if (method.toLowerCase() !== candidate.metadata.verb.toLowerCase()) {
    return undefined;
  }

  const bucket = dispatchPattern !== undefined ? dispatchPattern : candidate.bucket;
  if (bucket !== candidate.bucket) {
    return undefined;
  }

  // Literal, constant query-string disambiguators embedded in the generated `path` (e.g.
  // `?restype=service&comp=properties`) must match exactly - this is how multiple
  // operations sharing the same bucket/verb (e.g. `Create` vs `SetMetadata`, both `PUT
  // /queue`) are told apart. An operation declaring MORE literal pairs that all match is a
  // more specific match than one declaring none, so (mirroring the original AutoRest-era
  // dispatcher's "most conditions met wins" behavior) we track a score rather than stopping
  // at the first structurally-valid candidate.
  let score = 0;
  for (const [key, expected] of candidate.literalQuery) {
    if (req.getQuery(key) !== expected) {
      return undefined;
    }
    score++;
  }

  // Required dynamic query parameters (e.g. a required `timeout`) must at least be present.
  for (const name of requiredDynamicQueryParamNames(candidate.metadata)) {
    if (candidate.literalQuery.has(name)) {
      continue;
    }
    if (req.getQuery(name) === undefined) {
      return undefined;
    }
    score++;
  }

  return score;
}

/**
 * Dispatch Middleware will try to find out which operation of current HTTP request belongs to,
 * by matching against our generated `operations` metadata. Operation enum will be assigned to
 * context object. Make sure dispatchMiddleware is triggered before other generated middleware.
 *
 * @export
 * @param {Context} context Context object
 * @param {IRequest} req An request object
 * @param {NextFunction} next A callback
 * @param {ILogger} logger A valid logger
 * @returns {void}
 */
export default function dispatchMiddleware(
  context: Context,
  req: IRequest,
  next: NextFunction,
  logger: ILogger
): void {
  logger.verbose(`DispatchMiddleware: Dispatching request...`, context.contextID);

  // Several operations can be structurally valid for the same request (e.g. a SetMetadata
  // request also structurally satisfies Create, which declares no distinguishing literal query
  // of its own) - pick the one with the most matched conditions, exactly as the original
  // dispatcher did.
  let bestScore = -1;
  for (const candidate of ROUTABLE_OPERATIONS) {
    const score = matchResult(req, candidate, context.dispatchPattern);
    if (score !== undefined && score > bestScore) {
      context.operation = candidate.realOperation;
      bestScore = score;
    }
  }

  if (context.operation === undefined) {
    const handlerError = new UnsupportedRequestError();
    logger.error(`DispatchMiddleware: ${handlerError.message}`, context.contextID);
    return next(handlerError);
  }

  logger.info(`DispatchMiddleware: Operation=${Operation[context.operation]}`, context.contextID);

  next();
}
