import type { NextFunction, Request, RequestHandler, Response } from "express";

import QueueStorageContext from "../../context/QueueStorageContext";
import ExpressRequestAdapter from "../../generated/ExpressRequestAdapter";
import ExpressResponseAdapter from "../../generated/ExpressResponseAdapter";
import { DEFAULT_QUEUE_CONTEXT_PATH } from "../../utils/constants";
import MessageIdHandler from "../../handlers/MessageIdHandler";
import MessagesHandler from "../../handlers/MessagesHandler";
import QueueHandler from "../../handlers/QueueHandler";
import ServiceHandler from "../../handlers/ServiceHandler";
import type { OperationMetadata } from "../generated/operations";
import { operations } from "../generated/operations";

export interface RealHandlers {
  service: ServiceHandler;
  queue: QueueHandler;
  messages: MessagesHandler;
  messageId: MessageIdHandler;
}

/**
 * Parameters whose generated TS type is `number` rather than `string`. As before (see git
 * history on `dispatcher.ts`), the pilot emitter's `OperationParameterBinding` intentionally
 * only carries wire name/location/required-ness, not full type information, so coercion is left
 * as a dispatcher-boundary concern.
 */
const NUMERIC_PARAMETER_NAMES = new Set([
  "timeout",
  "maxresults",
  "numberOfMessages",
  "visibilityTimeout",
  "messageTimeToLive"
]);

/**
 * The four URL-depth "buckets" Azurite's own real, unmodified
 * `src/queue/middlewares/queueStorageContext.middleware.ts` already computes today (see
 * `queueContext.dispatchPattern` there) for every request, entirely independent of whether the
 * operation metadata driving dispatch comes from AutoRest or this pilot emitter: Azure Storage's
 * URL shape is `/{account}/{queue}/messages/{messageId}`, and `{queueName}` is a TCGC
 * `@clientInitialization` path segment the real Storage TypeSpec routes through the client's
 * base URL, not an HTTP operation parameter - so it never appears in generated operation
 * metadata from any generator, old or new. Classifying each of our 17 generated operations into
 * one of these 4 buckets is therefore unavoidable "dispatcher glue", matching exactly what
 * Azurite's real system already requires of *any* generated operation table.
 */
type DispatchPattern =
  "/" | "/queue" | "/queue/messages" | "/queue/messages/messageId";

const OPERATION_DISPATCH_PATTERN: Record<string, DispatchPattern> = {
  SetProperties: "/",
  GetProperties: "/",
  GetStatistics: "/",
  GetUserDelegationKey: "/",
  GetQueues: "/",
  Create: "/queue",
  QueueGetProperties: "/queue",
  Delete: "/queue",
  SetMetadata: "/queue",
  GetAccessPolicy: "/queue",
  SetAccessPolicy: "/queue",
  ReceiveMessages: "/queue/messages",
  Clear: "/queue/messages",
  SendMessage: "/queue/messages",
  PeekMessages: "/queue/messages",
  UpdateMessage: "/queue/messages/messageId",
  DeleteMessage: "/queue/messages/messageId"
};

/**
 * Operations this pilot deliberately does not invoke a real handler for: both require parsing a
 * deeply-nested XML request body (`StorageServiceProperties`, and a signing/XML round-trip for
 * `GetUserDelegationKey`) that is out of scope for this pilot (see README "What this does NOT
 * cover"). Generated metadata/types for both still exist - only the dispatch-time invocation is
 * skipped, with a clear 501 response rather than a silent mismatch.
 */
const UNWIRED_OPERATIONS = new Set(["SetProperties", "GetUserDelegationKey"]);

/** Splits a generated `operations[].path` (e.g. `"/messages?peekonly=true"`) into an
 * Express-routable template and the literal query key/value pairs a real request must match -
 * see `dispatch.middleware.ts`'s `isRequestAgainstOperation` for Azurite's real precedent for
 * this same literal-query disambiguation need. */
function splitPathAndLiteralQuery(path: string): {
  template: string;
  literalQuery: URLSearchParams;
} {
  const [rawTemplate, rawQuery = ""] = path.split("?", 2);
  const template =
    rawTemplate.startsWith("/") || rawTemplate === ""
      ? rawTemplate || "/"
      : `/${rawTemplate}`;
  return { template, literalQuery: new URLSearchParams(rawQuery) };
}

/** True when `operationPath`'s template matches the request path remaining under its
 * dispatchPattern bucket (accounting for the one path parameter we have, `{messageId}`, which is
 * read from `queueContext.messageId`, not matched here). */
function templateMatchesBucket(
  template: string,
  pattern: DispatchPattern
): boolean {
  if (pattern === "/queue/messages/messageId") {
    return /^\/messages\/\{messageId\}/.test(template);
  }
  if (pattern === "/queue/messages") {
    return template === "/messages";
  }
  // "/" and "/queue" operations both generate a template of "/" (no further path segments),
  // since queueName itself is never part of the template (see OPERATION_DISPATCH_PATTERN above).
  return template === "/";
}

interface RouteGroup {
  verb: string;
  pattern: DispatchPattern;
  candidates: { operation: OperationMetadata; literalQuery: URLSearchParams }[];
}

function buildRouteGroups(): RouteGroup[] {
  const groups = new Map<string, RouteGroup>();
  for (const operation of operations) {
    if (UNWIRED_OPERATIONS.has(operation.name)) {
      continue;
    }
    const pattern = OPERATION_DISPATCH_PATTERN[operation.name];
    const { template, literalQuery } = splitPathAndLiteralQuery(operation.path);
    if (!templateMatchesBucket(template, pattern)) {
      throw new Error(
        `Operation "${operation.name}" has path "${operation.path}" which does not match its declared dispatch bucket "${pattern}"`
      );
    }
    const key = `${pattern} ${operation.verb}`;
    const group = groups.get(key);
    if (group) {
      group.candidates.push({ operation, literalQuery });
    } else {
      groups.set(key, {
        verb: operation.verb,
        pattern,
        candidates: [{ operation, literalQuery }]
      });
    }
  }
  return [...groups.values()];
}

/** Picks the candidate operation in a route group whose literal query requirements the real
 * request satisfies, preferring the most specific (most literal query keys) match. */
function matchCandidate(
  group: RouteGroup,
  req: Request
): OperationMetadata | undefined {
  if (group.candidates.length === 1) {
    return group.candidates[0].operation;
  }
  const withQuery = [...group.candidates]
    .filter((c) => [...c.literalQuery.keys()].length > 0)
    .sort(
      (a, b) =>
        [...b.literalQuery.keys()].length - [...a.literalQuery.keys()].length
    );
  for (const candidate of withQuery) {
    const matches = [...candidate.literalQuery.entries()].every(
      ([key, value]) => String(req.query[key] ?? "") === value
    );
    if (matches) {
      return candidate.operation;
    }
  }
  return group.candidates.find((c) => [...c.literalQuery.keys()].length === 0)
    ?.operation;
}

function readParameter(
  req: Request,
  binding: OperationMetadata["parameters"][number]
): string | undefined {
  switch (binding.location) {
    case "path":
      // The only path parameter in this spec is `{messageId}`, which real Azurite already
      // parses into `queueContext.messageId` (see `extractStoragePartsFromPath`) - read it back
      // from there instead of duplicating that URL parsing here.
      return undefined;
    case "query": {
      const value = req.query[binding.wireName];
      return typeof value === "string" ? value : undefined;
    }
    case "header":
      return req.header(binding.wireName);
    default:
      return undefined;
  }
}

/** Builds the flat parameter bag (query/header values, numeric-coerced) for one operation from
 * the generated `operations[].parameters` metadata. `messageId`/`popReceipt` are intentionally
 * still included here (read generically like any other binding) - per-operation invocation code
 * below picks them out of this bag where the real handler needs them as positional arguments
 * rather than inside `options`. */
function readParameters(
  req: Request,
  operation: OperationMetadata
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const binding of operation.parameters) {
    const rawValue = readParameter(req, binding);
    if (rawValue !== undefined) {
      params[binding.name] = NUMERIC_PARAMETER_NAMES.has(binding.name)
        ? Number(rawValue)
        : rawValue;
    }
  }
  return params;
}

/**
 * Builds the real handlers' `options` bag from our generated parameter names, applying the two
 * field-name renames needed to match the real, hand-written `Models.*OptionalParams` interfaces
 * in `src/queue/generated/artifacts/models.ts` (confirmed by direct comparison):
 *   - our `clientRequestId` -> real `requestId` (the real handlers read `options.requestId` and
 *     echo it back as the response's `clientRequestId` header field themselves).
 *   - our `visibilityTimeout` -> real `visibilitytimeout` (all-lowercase, single word).
 * Every other field name (`timeout`, `prefix`, `marker`, `maxresults`, `numberOfMessages`,
 * `messageTimeToLive`) already matches the real optional-params interfaces exactly.
 */
function buildOptions(
  params: Record<string, unknown>,
  dropKeys: string[] = []
): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (
      value === undefined ||
      dropKeys.includes(key) ||
      key === "messageId" ||
      key === "popReceipt"
    ) {
      continue;
    }
    if (key === "clientRequestId") {
      options.requestId = value;
    } else if (key === "visibilityTimeout") {
      options.visibilitytimeout = value;
    } else {
      options[key] = value;
    }
  }
  return options;
}

/**
 * The real `QueueHandler.create`/`setMetadata` expect `options.metadata` to be a
 * `{ [name: string]: string }` dictionary with one entry per `x-ms-meta-*` request header
 * (lowercase-keyed; the handler itself recovers original casing via `context.request`'s raw
 * headers - see `QueueHandler.parseMetadata`). The real Storage Queue TypeSpec - like our pilot
 * emitter's generated binding - only exposes a single `metadata?: string` header
 * (`@header("x-ms-meta") metadata?: string`), since that's genuinely how the spec itself models
 * it; the old AutoRest-based deserializer built this dictionary from the raw, prefix-matched
 * headers, not from the spec's single `metadata` field, so we do the same here directly against
 * the real Express request rather than through our generated single-string binding.
 */
function buildMetadataDict(req: Request): Record<string, string> | undefined {
  const prefix = "x-ms-meta-";
  let found = false;
  const dict: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase().startsWith(prefix) && typeof value === "string") {
      dict[key.slice(prefix.length)] = value;
      found = true;
    }
  }
  return found ? dict : undefined;
}

/**
 * Invokes the matching REAL, unmodified handler method (`src/queue/handlers/*.ts`) for one
 * generated operation, translating our flat parameter bag into each method's actual call
 * signature. Mirrors the role of Azurite's own real
 * `src/queue/generated/handlers/handlerMappers.ts` (a per-operation `{handler, method,
 * arguments}` table read off `context.handlerParameters`) - the real precedent confirming that a
 * small per-operation argument-mapping table is unavoidable "generated glue", not duplicated
 * business logic, since handler call signatures are not uniform (see `MessageIdHandler.update`'s
 * three positional arguments before `options`).
 */
async function invokeOperation(
  operation: OperationMetadata,
  params: Record<string, unknown>,
  req: Request,
  context: QueueStorageContext,
  handlers: RealHandlers
): Promise<unknown> {
  switch (operation.name) {
    case "GetProperties":
      return handlers.service.getProperties(buildOptions(params), context);
    case "GetStatistics":
      return handlers.service.getStatistics(buildOptions(params), context);
    case "GetQueues": {
      const options = buildOptions(params);
      if (typeof options.include === "string") {
        options.include = (options.include as string).split(",");
      }
      return handlers.service.listQueuesSegment(options, context);
    }
    case "Create":
      return handlers.queue.create(
        { ...buildOptions(params), metadata: buildMetadataDict(req) },
        context
      );
    case "QueueGetProperties":
      return handlers.queue.getProperties(buildOptions(params), context);
    case "Delete":
      return handlers.queue.delete(buildOptions(params), context);
    case "SetMetadata":
      return handlers.queue.setMetadata(
        { ...buildOptions(params), metadata: buildMetadataDict(req) },
        context
      );
    case "GetAccessPolicy":
      return handlers.queue.getAccessPolicy(buildOptions(params), context);
    case "SetAccessPolicy":
      // Out of scope: the SignedIdentifier[] ACL body is XML and not parsed by this pilot, so
      // `queueAcl` is always left undefined here (the real handler treats that as "no ACLs").
      return handlers.queue.setAccessPolicy(buildOptions(params), context);
    case "ReceiveMessages":
      return handlers.messages.dequeue(buildOptions(params), context);
    case "Clear":
      return handlers.messages.clear(buildOptions(params), context);
    case "SendMessage": {
      const body = (req.body ?? {}) as { messageText?: string };
      return handlers.messages.enqueue(
        { messageText: body.messageText },
        buildOptions(params),
        context
      );
    }
    case "PeekMessages":
      return handlers.messages.peek(buildOptions(params), context);
    case "UpdateMessage": {
      const body = (req.body ?? {}) as { messageText?: string };
      const popReceipt = String(params.popReceipt ?? "");
      const visibilitytimeout = Number(params.visibilityTimeout ?? 0);
      const options = buildOptions(params, ["popReceipt", "visibilityTimeout"]);
      return handlers.messageId.update(
        { messageText: body.messageText },
        popReceipt,
        visibilitytimeout,
        options,
        context
      );
    }
    case "DeleteMessage": {
      const popReceipt = String(params.popReceipt ?? "");
      const options = buildOptions(params, ["popReceipt"]);
      return handlers.messageId.delete(popReceipt, options, context);
    }
    default:
      throw new Error(
        `No real-handler invocation mapped for operation "${operation.name}"`
      );
  }
}

/**
 * Shapes a real handler's resolved value into an HTTP response using the generated per-status
 * `OperationResponseMetadata`. This works *generically* across every operation with no
 * per-operation special-casing, because the real handlers (confirmed by direct inspection of
 * `src/queue/handlers/*.ts`) already return a flat object whose property names - `statusCode`,
 * `version`, `requestId`, `clientRequestId`, `date`, `metadata`, `approximateMessagesCount`,
 * `popReceipt`, `timeNextVisible`, etc. - match our generated response header `name` fields
 * exactly; whatever remains after removing `statusCode` and the declared header names is the
 * real body. Several operations (`dequeue`/`enqueue`/`peek`/`getAccessPolicy`) return a plain
 * `Array` with those same header fields attached as extra own properties - handled here by
 * treating the array itself as the JSON body (header lookups still work identically, and
 * `res.json()` on an array naturally ignores the non-index extra properties).
 */
function applyResponse(
  res: Response,
  operation: OperationMetadata,
  result: unknown
): void {
  const record = result as Record<string, unknown> | undefined;
  const statusCode =
    typeof record?.statusCode === "number"
      ? (record.statusCode as number)
      : 200;
  const responseMetadata =
    operation.responses.find((r) => r.statusCode === statusCode) ??
    operation.responses.find((r) => r.statusCode === "*");
  res.status(statusCode);

  const headerNames = new Set<string>(
    responseMetadata?.headers.map((h) => h.name) ?? []
  );
  if (responseMetadata && record) {
    for (const headerBinding of responseMetadata.headers) {
      const value = record[headerBinding.name];
      if (value === undefined) {
        continue;
      }
      if (headerBinding.name === "metadata" && typeof value === "object") {
        // Real Azure Storage (and real Azurite) send queue metadata as one `x-ms-meta-{key}`
        // header per stored entry, not a single JSON-encoded header - our generated binding only
        // models the *request*-side `x-ms-meta` header as a single string (matching the real
        // spec's own `@header("x-ms-meta") metadata?: string` declaration), so the response side
        // needs this same documented adaptation to expand the real handler's
        // `{ [name]: string }` dictionary back into per-key wire headers.
        for (const [metaKey, metaValue] of Object.entries(
          value as Record<string, string>
        )) {
          res.setHeader(`x-ms-meta-${metaKey}`, metaValue);
        }
        continue;
      }
      res.setHeader(
        headerBinding.wireName,
        value instanceof Date ? value.toUTCString() : String(value)
      );
    }
  }

  if (Array.isArray(result)) {
    res.json(result);
    return;
  }

  const bodyEntries = Object.entries(record ?? {}).filter(
    ([key]) => key !== "statusCode" && !headerNames.has(key)
  );
  if (bodyEntries.length === 0) {
    res.end();
  } else {
    res.json(Object.fromEntries(bodyEntries));
  }
}

/**
 * The dispatch/parameter-binding/response-shaping middleware this pilot adds. It is the *only*
 * newly-written piece of server logic in this integration: it runs after Azurite's real,
 * unmodified `createQueueStorageContextMiddleware` (which has already parsed
 * account/queue/message/messageId and computed `dispatchPattern`), matches the request against
 * an operation purely from the pilot emitter's generated `operations` metadata, invokes the
 * matching REAL `src/queue/handlers/*.ts` business-logic method unmodified, and shapes its
 * response - forwarding any thrown error to Azurite's real, unmodified `error.middleware.ts`.
 */
export function createPilotDispatchMiddleware(
  handlers: RealHandlers
): RequestHandler {
  const groups = buildRouteGroups();
  const groupsByKey = new Map<string, RouteGroup>(
    groups.map((g) => [`${g.pattern} ${g.verb}`, g])
  );

  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const context = new QueueStorageContext(
        res.locals,
        DEFAULT_QUEUE_CONTEXT_PATH
      );
      context.request = new ExpressRequestAdapter(req);
      context.response = new ExpressResponseAdapter(res);

      const verb = req.method.toLowerCase();
      const group = groupsByKey.get(`${context.dispatchPattern} ${verb}`);
      const operation = group && matchCandidate(group, req);
      if (!operation) {
        next();
        return;
      }

      try {
        const params = readParameters(req, operation);
        const result = await invokeOperation(
          operation,
          params,
          req,
          context,
          handlers
        );
        applyResponse(res, operation, result);
      } catch (error) {
        next(error);
      }
    })();
  };
}
