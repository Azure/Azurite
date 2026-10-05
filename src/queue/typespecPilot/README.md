# TypeSpec emitter pilot — generated dispatch metadata driving Azurite's real Queue handlers

This folder is **not production code**. It demonstrates that the generated output of an internal
pilot/prototype TypeSpec emitter (`@azure-tools/typespec-azurite-emitter`, built in
`Azure/typespec-azure#5614`) — compiled from the **real, unmodified** Azure Storage Queue
TypeSpec (pinned by commit hash, not vendored — see `fixture/storage-queue-real/PROVENANCE.md`)
plus a real `azurite.tsp` overlay — can **directly replace** the generated
route/dispatch/parameter-binding layer Azurite's real Queue server relies on
(`src/queue/generated/middleware/dispatch.middleware.ts` +
`src/queue/generated/handlers/handlerMappers.ts` + `src/queue/generated/artifacts/routes.ts`,
today produced by AutoRest), while Azurite's own real, **completely unmodified** business logic,
persistence, and error-handling keep running underneath it.

**Only one new file was written for this integration: `server/pilotDispatchMiddleware.ts`.**
Everything else this pilot server uses is Azurite's real, unmodified code:
`QueueHandler`/`ServiceHandler`/`MessagesHandler`/`MessageIdHandler` (real business logic),
`LokiQueueMetadataStore`/`LokiExtentMetadataStore`/`MemoryExtentStore` (real persistence, wired
in-memory the same way `src/queue/QueueServer.ts` does), `queueStorageContext.middleware.ts` (the
real account/queue/message/messageId + `dispatchPattern` URL parser),
`Context.ts`/`QueueStorageContext.ts` (the real request-context holder objects),
`ExpressRequestAdapter`/`ExpressResponseAdapter` (required because the real handlers reach into
raw Express request/response internals), and `error.middleware.ts`/`end.middleware.ts` (the real
error-to-HTTP-response pipeline).

This folder lives at `src/queue/typespecPilot/` (rather than at the repo root) specifically so
it's picked up by the existing `COPY src ./src` step in `Dockerfile`/`Dockerfile.Windows` and by
the repo's normal `tsc`/`npm run build` without any build-tooling changes.

## What's here

- **`fixture/storage-queue-real/azurite.tsp`** — the Azurite-specific overlay, the only `.tsp`
  file actually committed in this repo. It imports a base Storage Queue spec that is **pinned by
  commit hash, not vendored** — see `PROVENANCE.md` for the exact commit, and how to fetch it and
  regenerate. The overlay applies Azurite's actual, documented emulator-specific customizations
  ([`swagger/queue.md`](https://github.com/Azure/Azurite/blob/main/swagger/queue.md), "Changes
  Made to Client Swagger") via TypeSpec augment decorators (`@@maxValue`, `@@doc`) on top of the
  unmodified pinned spec.
- **`generated/{models.ts,operations.ts,handlers.ts}`** — the **unmodified, copy-pasted output**
  of running the pilot emitter against `azurite.tsp`. Nothing in this folder was hand-written.
  **All 17 real Queue operations** (the `Service` and `Queue` interfaces, flattened into one
  `IServiceHandler`) generate with **zero diagnostics and zero skipped operations**; see
  `fixture/storage-queue-real/PROVENANCE.md` for exactly how to regenerate.
- **`server/pilotDispatchMiddleware.ts`** — the one new file. Matches an incoming request to one
  of the 17 generated operations using only the real
  `queueStorageContext.middleware.ts`'s `dispatchPattern` plus the generated `operations` route
  metadata (method, path, literal-query disambiguation for same-path/same-verb operations),
  extracts path/query/header parameters from the generated parameter bindings, invokes the
  matching REAL handler method with the real call signature (mirroring the role Azurite's own
  real `handlerMappers.ts` plays for the AutoRest-generated surface), and shapes the real
  handler's return value into an HTTP response using the generated per-status response metadata.
  Forwards any thrown error to `next(error)` so Azurite's real, unmodified `error.middleware.ts`
  handles it.
- **`server/createPilotServer.ts`** — constructs real in-memory persistence stores, real handler
  instances, and wires the real context middleware + `pilotDispatchMiddleware` + real
  error/end middleware into one `express.Express` app. No fake/parallel business logic anywhere.
- `../../../tests/typespec-emitter-pilot/generatedArtifacts.test.ts` — structural assertions on
  the real-spec-generated files in isolation (tagged `@loki`, runs under `npm test`, no server
  needed): operation count, route metadata, parameter location/required-ness, response header
  wire-name mapping, the overlay's `@@doc` override taking effect, handler method shape, and an
  explicit test pinning down the `queueName`-is-client-scoped gap described below.
- **`../../../tests/typespec-emitter-pilot/pilotServer.e2e.test.ts`** — the real end-to-end
  proof: starts `createPilotServer`'s Express app on an ephemeral port and drives it with genuine
  HTTP requests against real, account-scoped Queue URLs (`/devstoreaccount1/{queue}/...`) —
  queue create / duplicate-conflict / get-properties / metadata round-trip via real
  `x-ms-meta-*` headers, service-level list-queues / get-properties literal-query
  disambiguation, a full message lifecycle (send → peek → receive → update → delete), a real
  handler-thrown error (`GetStatistics` on a non-secondary account) flowing through the real,
  unmodified `error.middleware.ts`, and a 404 for an unmatched route — asserting the full path
  — HTTP request → generated-metadata dispatch → **real** persistence/business logic →
  generated-metadata response shaping → real HTTP response — works end to end, with the real
  handler classes doing the actual work.

## What this proves

- The pilot emitter compiles the **real, unmodified, full Storage Queue TypeSpec** (not a toy
  subset), pinned by commit hash rather than vendored, plus a real `azurite.tsp` overlay, with
  **zero diagnostics**, generating all 17 operations' models, route metadata, and handler
  interface.
- That generated metadata can **directly drive Azurite's real, unmodified handler classes** —
  the same `QueueHandler`/`ServiceHandler`/`MessagesHandler`/`MessageIdHandler` business logic
  and real in-memory persistence stores Azurite ships today — with only one new file
  (`pilotDispatchMiddleware.ts`) standing in for the generated
  `dispatch.middleware.ts`/`handlerMappers.ts`/`routes.ts` layer.
- Real client-visible behavior (duplicate-queue 409/204 semantics, metadata header round-trips,
  literal-query disambiguation between same-path operations, and real error responses) all work
  correctly when driven purely by the new emitter's generated metadata.
- The generated handler interface's method shape — `(params, context) => Promise<Response>` —
  matches the calling convention of Azurite's real `I*Handler` interfaces well enough that the
  real, already-existing handler classes satisfy it directly, with no modification.

## What this surfaced (the most important finding)

**`{queueName}` is not an HTTP operation parameter anywhere in the real spec.** Queue-scoped
operations (`Create`, `QueueGetProperties`, `Delete`, `SetMetadata`, `GetAccessPolicy`,
`SetAccessPolicy`, and all message operations) have paths like `/`, `/messages`,
`?comp=metadata` with **no mention of queueName at all** — the real spec resolves the queue name
via the `QueueClient`'s base URL (a TCGC `@clientInitialization`/client-scoped-path concept), not
as a per-operation HTTP parameter. A pilot emitter that (by design, matching the original pilot
scope) walks only `@typespec/http` — not TCGC's client-initialization model — **cannot see this
at all**: it is structurally absent from the generated `operations` metadata, not merely omitted
by a bug.

This pilot resolves the gap by reusing Azurite's own real, already-computed answer rather than
reinventing one: `pilotDispatchMiddleware.ts`'s `OPERATION_DISPATCH_PATTERN` maps each generated
operation onto the exact same four `dispatchPattern` bucket values
(`"/" | "/queue" | "/queue/messages" | "/queue/messages/messageId"`) that Azurite's real
`queueStorageContext.middleware.ts` already computes from the URL for every request, regardless
of generator. `generatedArtifacts.test.ts` has an explicit test pinning down this absence so the
gap can't silently regress. A real migration would need either (a) emitter support for walking
TCGC client-initialization path parameters, or (b) Azurite's own dispatcher continuing to apply
this exact convention by hand, the way it effectively already does today.

Two smaller, secondary findings, neither an emitter bug — both are properties of the real spec
itself:

- Several operations share the same (verb, path) and are disambiguated only by a **literal query
  string baked directly into `@route`** (e.g. `@route("?comp=metadata")`,
  `@route("messages?peekonly=true")`). The generated `operations[].path` honestly includes this
  literal text; `pilotDispatchMiddleware.ts`'s `splitPathAndLiteralQuery`/`matchCandidate` parse
  it out and pick the best-matching operation per request — the same kind of collision-handling
  `dispatch.middleware.ts`'s `isRequestAgainstOperation` already does for the AutoRest-generated
  surface.
- `metadata` renders as a single `string` header (wire name `x-ms-meta`) in the generated
  binding, because that's how `models.tsp`'s `MetadataHeaders` alias itself declares it — but the
  real wire protocol, and the real handlers, actually use one `x-ms-meta-{key}` header per
  metadata entry and a `{[key]: string}` dictionary. `pilotDispatchMiddleware.ts` bridges this
  symmetrically on both the request side (`buildMetadataDict`, reading raw `x-ms-meta-*` headers
  directly) and the response side (`applyResponse`, expanding a dictionary value back into
  per-key headers) — a detail invisible at the TypeSpec layer in either direction.

## What this does **not** prove / explicitly out of scope

- **No XML (de)serialization.** The real spec's bodies are `application/xml`; this pilot's
  dispatcher/tests only ever deal in plain JS objects over JSON (`SendMessage`/`UpdateMessage`
  request bodies), as an explicitly documented stand-in for the real wire format. `SetProperties`
  and `GetUserDelegationKey` are left unwired entirely (see `UNWIRED_OPERATIONS`) since their
  request/response bodies require real XML parsing.
- `SetAccessPolicy`'s `SignedIdentifier[]` ACL body is also XML and is not parsed — the real
  handler is still invoked, just always with an empty ACL.
- No OData/Table-specific or Blob-specific behavior is modeled — only Queue.
- No auth (`AccountDataStore`/auth middleware is not wired — every request is treated as
  pre-authenticated), no CORS, and no `-secondary` endpoint suffix for secondary-region reads
  (meaning `GetStatistics` always throws here — turned into a positive test case proving real
  error-middleware forwarding works end to end).
- Parameter _type_ coercion (e.g. turning a query string into a `number`) is hand-written and
  hardcoded by parameter name in `pilotDispatchMiddleware.ts` rather than driven by generated
  metadata, since the generated `OperationParameterBinding` doesn't carry a type tag — noted as a
  candidate follow-up enhancement to the emitter.
- This pilot server is a standalone Express app constructed by `createPilotServer.ts`, not a
  modification of `src/queue/QueueServer.ts`/`QueueRequestListenerFactory.ts` itself. Wiring this
  dispatch layer into Azurite's actual production server startup path (behind a flag, or as a
  full replacement) is follow-on work for a real collaboration, not this pilot.

This PR is intended purely to let the Azurite team run/inspect the pilot's generated code —
driving Azurite's real, unmodified handlers with it against the real spec — inside their own
toolchain and give feedback, ahead of any decision to invest further in this direction. It is
**not intended to be merged as-is**.
