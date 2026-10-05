import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";

import type { Context, IServiceHandler } from "../generated/handlers";
import type { OperationMetadata } from "../generated/operations";
import { operations } from "../generated/operations";

/**
 * Parameters whose generated TS type is `number` rather than `string`. The dispatch metadata
 * emitted by the pilot emitter (`OperationParameterBinding`) intentionally only carries what a
 * dispatcher needs to match/extract a request (wire name, location, required-ness) - not full
 * type information, so coercing a raw string query/header value into the right JS type is left
 * as a handler-boundary concern, the same way a typed router layer normally works. These are the
 * real Storage Queue spec's numeric query parameters (`timeout`, `maxresults`, `numofmessages`,
 * `visibilitytimeout`, `messagettl`); a richer emitter could emit a `type` tag on
 * `OperationParameterBinding` to make this generic, noted as follow-up work in the README.
 */
const NUMERIC_PARAMETER_NAMES = new Set([
  "timeout",
  "maxresults",
  "numberOfMessages",
  "visibilityTimeout",
  "messageTimeToLive",
]);

/**
 * GAP, documented (see README "What this surfaced" / `fixture/storage-queue-real/PROVENANCE.md`):
 * the real Storage Queue TypeSpec routes `{queueName}` through the client's own base URL
 * (`QueueClient` initialization, a TCGC `@clientInitialization` concept), not as an HTTP
 * operation parameter - so it never appears in this pilot emitter's generated `operations`
 * metadata at all (the emitter deliberately only walks `@typespec/http`, not TCGC). A dispatcher
 * built *purely* from the generated metadata therefore cannot tell which operations are
 * queue-scoped (need a `/{queueName}` URL prefix) versus service-scoped (operate on the account's
 * Queue service as a whole). This hardcoded classification is the hand-written workaround; a
 * real migration would need either (a) emitter support for walking TCGC client-initialization
 * path parameters, or (b) Azurite's own dispatcher continuing to apply this exact convention
 * itself, the way it already does today for AutoRest-generated specs.
 */
const QUEUE_SCOPED_OPERATIONS = new Set([
  "Create",
  "QueueGetProperties",
  "Delete",
  "SetMetadata",
  "GetAccessPolicy",
  "SetAccessPolicy",
  "ReceiveMessages",
  "Clear",
  "SendMessage",
  "PeekMessages",
  "UpdateMessage",
  "DeleteMessage",
]);

type HandlerMethod = (params: unknown, context: Context) => Promise<HandlerResult>;

interface HandlerResult {
  statusCode: number;
  headers?: Record<string, unknown>;
  body?: unknown;
}

/**
 * The real Storage Queue spec routes several operations sharing the same HTTP verb and base path
 * to distinct "virtual sub-resources" using a literal, hardcoded query string baked directly into
 * `@route` (e.g. `?comp=metadata`, `?comp=list`), rather than a `@query`-bound parameter a
 * dispatcher could read generically. The generated `operations[].path` honestly reflects this
 * (e.g. `"?comp=metadata"`, `"/messages?peekonly=true"`) - Express itself can't route on query
 * string content, so this splits each generated path into an Express-routable template plus the
 * literal query key/value pairs a real request must match, the same disambiguation Azurite's own
 * `dispatch.middleware.ts` (`isRequestAgainstOperation`) performs today against AutoRest specs.
 */
function splitPathAndLiteralQuery(path: string): {
  template: string;
  literalQuery: URLSearchParams;
} {
  const [rawTemplate, rawQuery = ""] = path.split("?", 2);
  const template = rawTemplate.startsWith("/") || rawTemplate === "" ? rawTemplate || "/" : `/${rawTemplate}`;
  return { template, literalQuery: new URLSearchParams(rawQuery) };
}

/** Converts a TypeSpec-style route template (e.g. `/{queueName}/messages`) into an Express path (`/:queueName/messages`). */
function toExpressPath(path: string): string {
  return path.replace(/\{(\w+)\}/g, ":$1");
}

/**
 * Operation names are PascalCase (e.g. `"CreateQueue"`); handler methods are camelCase (e.g.
 * `createQueue`) - the same convention the pilot emitter's `render-handlers.ts` uses to derive
 * `IServiceHandler` method names from `ServerOperation.name`, duplicated here since this is
 * hand-written glue code, not generated.
 */
function handlerMethodName(operationName: string): string {
  return operationName[0].toLowerCase() + operationName.slice(1);
}

function readParameter(
  req: Request,
  binding: OperationMetadata["parameters"][number],
): string | undefined {
  switch (binding.location) {
    case "path": {
      const value = req.params[binding.name];
      return typeof value === "string" ? value : undefined;
    }
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

/**
 * Translates a handler's typed result (`{ statusCode, headers, body }`, shaped like the
 * generated `XxxResponse` union) into a real Express HTTP response, using the generated
 * per-status `OperationResponseMetadata` to map each typed `headers` property (e.g.
 * `approximateMessagesCount`) back to its real wire header name (e.g.
 * `x-ms-approximate-messages-count`).
 */
function applyResponse(res: Response, operation: OperationMetadata, result: HandlerResult): void {
  const responseMetadata = operation.responses.find((r) => r.statusCode === result.statusCode);
  res.status(result.statusCode);
  if (result.headers && responseMetadata) {
    const headers = result.headers;
    for (const headerBinding of responseMetadata.headers) {
      const value = headers[headerBinding.name];
      if (value !== undefined) {
        res.setHeader(headerBinding.wireName, String(value));
      }
    }
  }
  if (result.body !== undefined) {
    res.json(result.body);
  } else {
    res.end();
  }
}

/** One Express-routable group: a single (verb, path template) pair, possibly serving more than
 * one generated operation disambiguated by a literal query string (see
 * `splitPathAndLiteralQuery`). */
interface RouteGroup {
  verb: string;
  expressPath: string;
  candidates: { operation: OperationMetadata; literalQuery: URLSearchParams }[];
}

function buildRouteGroups(): RouteGroup[] {
  const groups = new Map<string, RouteGroup>();
  for (const operation of operations) {
    const { template, literalQuery } = splitPathAndLiteralQuery(operation.path);
    const prefix = QUEUE_SCOPED_OPERATIONS.has(operation.name) ? "/:queueName" : "";
    const fullTemplate = `${prefix}${template === "/" && prefix ? "" : template}` || "/";
    const expressPath = toExpressPath(fullTemplate);
    const key = `${operation.verb} ${expressPath}`;
    const group = groups.get(key);
    if (group) {
      group.candidates.push({ operation, literalQuery });
    } else {
      groups.set(key, {
        verb: operation.verb,
        expressPath,
        candidates: [{ operation, literalQuery }],
      });
    }
  }
  return [...groups.values()];
}

/** Picks the candidate operation in a route group whose literal query requirements the real
 * request satisfies, preferring the most specific (most literal query keys) match, and falling
 * back to a candidate with no literal query requirements. */
function matchCandidate(
  group: RouteGroup,
  req: Request,
): OperationMetadata | undefined {
  if (group.candidates.length === 1) {
    return group.candidates[0].operation;
  }
  const withQuery = [...group.candidates]
    .filter((c) => [...c.literalQuery.keys()].length > 0)
    .sort((a, b) => [...b.literalQuery.keys()].length - [...a.literalQuery.keys()].length);
  for (const candidate of withQuery) {
    const matches = [...candidate.literalQuery.entries()].every(
      ([key, value]) => String(req.query[key] ?? "") === value,
    );
    if (matches) {
      return candidate.operation;
    }
  }
  return group.candidates.find((c) => [...c.literalQuery.keys()].length === 0)?.operation;
}

/**
 * A hand-written Express dispatcher that builds real HTTP routes directly from the pilot
 * emitter's generated `operations` metadata table
 * (`src/queue/typespecPilot/generated/operations.ts`), and binds each route to the matching
 * method on a hand-written `IServiceHandler` implementation. Analogous in spirit to Azurite's
 * real generated dispatcher (`src/queue/generated/middleware/dispatch.middleware.ts`'s
 * `isRequestAgainstOperation`), which matches requests against AutoRest-generated
 * `OperationSpec`s and invokes the matching hand-written `IQueueHandler` method - except here the
 * metadata table itself is generated by the TypeSpec pilot emitter instead of AutoRest. This is
 * the piece that proves the generated contract is actually load-bearing: real HTTP requests are
 * routed and parameter-bound purely from `operations` metadata (plus the hand-written
 * `QUEUE_SCOPED_OPERATIONS` classification documented above), not from hand-written route
 * strings per operation.
 */
export function createPilotRouter(handler: IServiceHandler): Router {
  const router = Router();

  for (const group of buildRouteGroups()) {
    const method = group.verb as "get" | "put" | "post" | "patch" | "delete" | "head";
    router[method](group.expressPath, (req: Request, res: Response) => {
      void (async () => {
        const operation = matchCandidate(group, req);
        if (!operation) {
          res.status(404).json({ error: "No operation matched this request's query string" });
          return;
        }
        try {
          const params: Record<string, unknown> = {};
          for (const binding of operation.parameters) {
            const rawValue = readParameter(req, binding);
            if (binding.required && rawValue === undefined) {
              res.status(400).json({
                error: `Missing required ${binding.location} parameter "${binding.wireName}"`,
              });
              return;
            }
            if (rawValue !== undefined) {
              params[binding.name] = NUMERIC_PARAMETER_NAMES.has(binding.name)
                ? Number(rawValue)
                : rawValue;
            }
          }
          if (operation.hasRequestBody) {
            params.body = req.body;
          }
          if (req.params.queueName !== undefined) {
            // See `QUEUE_SCOPED_OPERATIONS` above: queueName is an Express route param, not a
            // generated parameter binding, so it's attached out-of-band here.
            params.queueName = req.params.queueName;
          }

          const context: Context = { contextId: randomUUID() };
          const boundMethod = (handler as unknown as Record<string, HandlerMethod>)[
            handlerMethodName(operation.name)
          ];
          const result = await boundMethod.call(handler, params, context);

          applyResponse(res, operation, result);
        } catch (error) {
          res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
      })();
    });
  }

  return router;
}
