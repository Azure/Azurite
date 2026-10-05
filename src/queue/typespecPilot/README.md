# TypeSpec emitter pilot — generated dispatch metadata driving Azurite's real Queue pipeline

This folder is **not production code**. It demonstrates that the generated output of an internal
pilot/prototype TypeSpec emitter (`@azure-tools/typespec-azurite-emitter`, built in
`Azure/typespec-azure#5614`) — compiled from the **real, unmodified** Azure Storage Queue
TypeSpec (pinned by commit hash, not vendored — see `fixture/storage-queue/PROVENANCE.md`)
plus a real `azurite.tsp` overlay — can **directly drive Azurite's real, production Queue
server**, with only one real file patched in place:
**`src/queue/generated/middleware/dispatch.middleware.ts`**.

Nothing else in Azurite's real pipeline changes. `ExpressMiddlewareFactory`,
`QueueRequestListenerFactory`, `QueueServer`, the real
`QueueHandler`/`ServiceHandler`/`MessagesHandler`/`MessageIdHandler` business logic, the real
`LokiQueueMetadataStore`/persistence layer, `queueStorageContext.middleware.ts`, and the real,
AutoRest-generated deserializer/serializer middleware (still driven by
`Specifications`/`Mappers`, keyed by the real `Operation` enum) are all completely unmodified.
`dispatch.middleware.ts`'s only job is choosing a `context.operation` enum value — it does no
body/header (de)serialization — so it is the one piece of Azurite's generated-code boundary this
pilot can swap for generated-metadata-driven logic with zero changes anywhere else in the real
request pipeline.

This folder lives at `src/queue/typespecPilot/` (rather than at the repo root) specifically so
it's picked up by the existing `COPY src ./src` step in `Dockerfile`/`Dockerfile.Windows` and by
the repo's normal `tsc`/`npm run build` without any build-tooling changes.

## What's here

- **`fixture/storage-queue/azurite.tsp`** — the Azurite-specific overlay, the only `.tsp`
  file actually committed in this repo. It imports a base Storage Queue spec that is **pinned by
  commit hash, not vendored** — see `PROVENANCE.md` for the exact commit, and how to fetch it and
  regenerate. The overlay applies Azurite's actual, documented emulator-specific customizations
  ([`swagger/queue.md`](https://github.com/Azure/Azurite/blob/main/swagger/queue.md), "Changes
  Made to Client Swagger") via TypeSpec augment decorators (`@@maxValue`, `@@doc`) on top of the
  unmodified pinned spec.
- **`generated/{models.ts,operations.ts,handlers.ts}`** — the **unmodified, copy-pasted output**
  of running the pilot emitter against `azurite.tsp`. Nothing in this folder was hand-written.
  **All 17 real Queue operations** (the `Service` and `Queue` interfaces) generate with **zero
  diagnostics and zero skipped operations**, each carrying an `interfaceName` field
  (`"Service"`/`"Queue"`) in addition to name/verb/path/parameters/responses; see
  `fixture/storage-queue/PROVENANCE.md` for exactly how to regenerate.
- **`../generated/middleware/dispatch.middleware.ts`** (the real file, patched in place) —
  matches an incoming request to one of the 17 generated operations using the real
  `queueStorageContext.middleware.ts`'s `dispatchPattern` plus the generated `operations` route
  metadata (method, path, `interfaceName`, literal-query disambiguation for same-path/same-verb
  operations), maps the matched operation to Azurite's own legacy `Operation` enum value via a
  small, necessarily Azurite-specific name table, and sets `context.operation` exactly as the
  original AutoRest-era implementation did. Everything downstream of that assignment (parameter
  binding, (de)serialization, the real handler call, response shaping) is **completely
  untouched, real Azurite code** — this patch only changes *which* operation is selected, never
  how a selected operation is executed.
- `../../../tests/typespec-emitter-pilot/generatedArtifacts.test.ts` — structural assertions on
  the real-spec-generated files in isolation (tagged `@loki`, no server needed): operation count,
  route metadata, parameter location/required-ness, response header wire-name mapping, the
  overlay's `@@doc` override taking effect, handler method shape, `interfaceName` values, and an
  explicit test pinning down the `queueName`-is-client-scoped gap described below.
- **`../../../tests/typespec-emitter-pilot/dispatchMiddleware.test.ts`** — focused, HTTP-free
  unit tests of the patched `dispatchMiddleware` function itself: same-bucket/verb
  disambiguation (`Create` vs `SetMetadata`, `PeekMessages` vs `ReceiveMessages`, account-level
  `GetQueues` vs `GetProperties`), rejection of unroutable requests, and the documented
  `GetUserDelegationKey` gap (see below).
- **`../../../tests/typespec-emitter-pilot/pilotServer.e2e.test.ts`** — the real end-to-end
  proof: boots Azurite's actual `QueueServer` via the same real test harness
  (`QueueTestServerFactory`) `tests/queue/apis/queue.test.ts` uses, and drives it with a real
  `@azure/storage-queue` SDK client (real shared-key auth, real XML wire format) — queue create /
  duplicate-conflict, metadata round-trip, service-level list-queues / get-properties literal-
  query disambiguation, a full message lifecycle (send → peek → receive → update → delete), a
  real handler-thrown error (`GetStatistics` on a non-secondary account) flowing through the
  real, unmodified `error.middleware.ts`, and rejection of an unmatched route — proving the full
  path (HTTP request → real auth/context middleware → **patched dispatch** → real
  deserializer/handler/persistence/serializer middleware → real HTTP response) works end to end
  through a real SDK client, with only the dispatch decision driven by generated metadata.
- Running the full existing real Queue test suite (`tests/queue/**/*.test.ts`, 92 tests covering
  auth, CORS, SAS, special naming, messages, and all Queue/Service APIs) against the patched
  `dispatch.middleware.ts` passes unchanged — proving this swap introduces no regressions to
  Azurite's existing, real Queue functionality.

## What this proves

- The pilot emitter compiles the **real, unmodified, full Storage Queue TypeSpec** (not a toy
  subset), pinned by commit hash rather than vendored, plus a real `azurite.tsp` overlay, with
  **zero diagnostics**, generating all 17 operations' models, route metadata, and handler
  interface.
- That generated metadata is sufficient, on its own, to drive the **real operation-selection
  decision** inside Azurite's real, unmodified production request pipeline — not a parallel
  server, not a reimplementation of any business logic, persistence, or (de)serialization.
- Real client-visible behavior (duplicate-queue 409/204 semantics, metadata header round-trips,
  literal-query disambiguation between same-path operations, real error responses, and the full
  existing 92-test real Queue suite) all continue to work correctly with dispatch driven purely
  by the new emitter's generated metadata.

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

Rather than working around this with a hand-written, per-operation-name classification table in
Azurite, **the emitter itself was extended** to emit an `interfaceName` field
(`ServerOperation.interfaceName`, from `op.operation.interface?.name`) recording which TypeSpec
`interface` declared each operation. `dispatch.middleware.ts`'s `dispatchBucketFor` combines this
generic field with the operation's path shape to classify every operation into the same four
`dispatchPattern` bucket values (`"/" | "/queue" | "/queue/messages" |
"/queue/messages/messageId"`) that Azurite's real `queueStorageContext.middleware.ts` already
computes from the URL for every request — with no per-operation-name table at all.
`generatedArtifacts.test.ts` has explicit tests pinning down both the `queueName` absence and the
real spec's actual `interfaceName` values so neither can silently regress. A real migration would
still need either (a) emitter support for walking TCGC client-initialization path parameters (to
recover the true wire-level path), or (b) a dispatcher-side convention like this one; `interfaceName`
narrows that gap from "a full per-operation table" to "a small, generic, reusable field".

One smaller, secondary finding, not an emitter bug but a property of the real spec itself:
several operations share the same (verb, path) and are disambiguated only by a **literal query
string baked directly into `@route`** (e.g. `@route("?comp=metadata")`,
`@route("messages?peekonly=true")`). The generated `operations[].path` honestly includes this
literal text; `dispatch.middleware.ts`'s `splitPathAndLiteralQuery`/scored `matchResult` parse it
out and pick the best-matching (most-specific) operation per request — the same kind of
collision-handling the original AutoRest-era `isRequestAgainstOperation` did for the
AutoRest-generated surface.

## A genuine, pre-existing Azurite gap this surfaced: `GetUserDelegationKey`

The vendored spec's `Service` interface declares a `getUserDelegationKey` operation, but Azurite
has **no corresponding `Operation` enum member and no handler implementation at all** today
(confirmed against `src/queue/generated/artifacts/operation.ts` and
`src/queue/handlers/ServiceHandler.ts`). This is a real, pre-existing gap in Azurite's own Queue
support, not something introduced by this pilot or the emitter. `OPERATION_NAME_TO_REAL_ENUM` in
`dispatch.middleware.ts` intentionally omits it (with a comment), so such requests correctly fall
through to the same `UnsupportedRequestError` a real dispatcher gives today;
`dispatchMiddleware.test.ts` has an explicit test documenting this.

## What this does **not** prove / explicitly out of scope

- **No XML (de)serialization changes.** Body/header (de)serialization is still entirely driven
  by Azurite's real, unmodified, AutoRest-generated `Specifications`/`Mappers` — this pilot never
  touches that layer, which is precisely why only `dispatch.middleware.ts` needed to change.
  Regenerating ms-rest-js-compatible `Mapper`/`OperationSpec` artifacts from the new emitter (to
  replace that layer too) was explicitly considered and rejected as disproportionate scope creep
  for this pilot.
- No OData/Table-specific or Blob-specific behavior is modeled — only Queue.
- No `-secondary` endpoint suffix handling was added or changed (unrelated to this patch); the
  e2e test's `GetStatistics`-on-primary-account 400 is an existing real behavior, used here as a
  convenient proof that handler-thrown errors still flow through the real error middleware.
- Parameter _type_ coercion (e.g. turning a query string into a `number`) is unaffected by this
  patch — it is still handled entirely by the real, untouched deserializer middleware.
- `OPERATION_NAME_TO_REAL_ENUM` (mapping our generated operation names to Azurite's legacy
  `Operation` enum) is unavoidably Azurite-specific glue: the enum itself is Azurite's own
  AutoRest-era artifact that the emitter doesn't and shouldn't know about, so this one small
  table cannot be derived generically from generated metadata.

This PR is intended purely to let the Azurite team run/inspect the pilot's generated code —
driving Azurite's real, unmodified pipeline with it against the real spec — inside their own
toolchain and give feedback, ahead of any decision to invest further in this direction. It is
**not intended to be merged as-is**.
