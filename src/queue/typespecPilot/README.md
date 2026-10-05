# TypeSpec emitter pilot — real Storage Queue spec + a hand-written server layer driven by it

This folder is **not production code**. It demonstrates a hand-written Express server
(`server/`) that is actually **driven by and dependent on** the generated output
(`generated/`) of an internal pilot/prototype TypeSpec emitter
(`@azure-tools/typespec-azurite-emitter-pilot`, built in `Azure/typespec-azure`), run against the
**real, unmodified** Azure Storage Queue TypeSpec plus a real `azurite.tsp` overlay, and exercised
with genuine HTTP requests using Azurite's own TypeScript toolchain (`tsc`, `ts-node`, `mocha`) —
without requiring any changes to Azurite's real `src/queue/generated/**` artifacts in this PR.

This folder lives at `src/queue/typespecPilot/` (rather than at the repo root) specifically so
it's picked up by the existing `COPY src ./src` step in `Dockerfile`/`Dockerfile.Windows` and by
the repo's normal `tsc`/`npm run build` without any build-tooling changes.

See the companion pull request: **Azure/typespec-azure#5614** ("Pilot: Azurite emitter prototype
on emitter-framework-style architecture") for the emitter source, its own unit/e2e tests (against
a small, self-contained toy fixture), and a detailed README covering design decisions and scope.

## What's here

- **`fixture/storage-queue-real/{main.tsp,models.tsp,routes.tsp,client.tsp}`** — a byte-for-byte,
  unmodified copy of the real Azure Storage Queue TypeSpec from `Azure/azure-rest-api-specs`
  (`specification/storage/data-plane/QueueStorage/`). See that directory's `PROVENANCE.md` for
  the exact source commit and what was intentionally left out (examples, readme, service.yaml).
- **`fixture/storage-queue-real/azurite.tsp`** — a real `azurite.tsp`-style overlay applying
  Azurite's actual, documented emulator-specific customizations
  ([`swagger/queue.md`](https://github.com/Azure/Azurite/blob/main/swagger/queue.md), "Changes
  Made to Client Swagger") via TypeSpec augment decorators (`@@maxValue`, `@@doc`) on top of the
  unchanged vendored spec — proving the overlay pattern (base Storage TypeSpec stays untouched;
  emulator-specific behavior layers on top in a separate file) works against the real spec, not
  just a toy one.
- `generated/models.ts`, `generated/operations.ts`, `generated/handlers.ts` — the **unmodified,
  copy-pasted output** of running the pilot emitter against `azurite.tsp` above. Produced by
  `tsp compile` via the emitter in `Azure/typespec-azure`'s
  `packages/typespec-azurite-emitter-pilot`; nothing in this folder was hand-written. **All 17
  real Queue operations** (the `Service` and `Queue` interfaces, flattened into one
  `IServiceHandler`) generate with **zero diagnostics and zero skipped operations**; see
  `fixture/storage-queue-real/PROVENANCE.md` for exactly how to regenerate.
- **`server/dispatcher.ts`** — a hand-written Express dispatcher that builds its routes purely
  from the generated `operations` metadata table (HTTP method, path template, parameter
  bindings) — no hand-written route strings — and translates a handler's typed result back into
  real HTTP status/headers/body using the generated per-status `OperationResponseMetadata`.
  Analogous in spirit to Azurite's real
  `src/queue/generated/middleware/dispatch.middleware.ts`'s `isRequestAgainstOperation`. Also
  contains the one hand-written piece of routing knowledge the generated metadata can't supply —
  see "What this surfaced" below.
- **`server/realQueueHandler.ts`** — a hand-written `class RealQueueHandler implements
  IServiceHandler`, filling in the generated handler interface (all 17 real operations) with
  simple in-memory business logic (no persistence, no auth, no XML) — analogous to Azurite's real
  hand-written `src/queue/handlers/QueueHandler.ts`. If the generated interface's method
  signatures changed incompatibly, this file would fail to compile — that's the point.
- **`server/createPilotServer.ts`** — wires the dispatcher and a handler implementation into a
  real `express.Express` app.
- `../../../tests/typespec-emitter-pilot/generatedArtifacts.test.ts` — structural assertions on
  the real-spec-generated files in isolation (tagged `@loki`, runs under `npm test`, no server
  needed): operation count, route metadata, parameter location/required-ness, response header
  wire-name mapping, the overlay's `@@doc` override taking effect, handler method shape, and an
  explicit test pinning down the `queueName`-is-client-scoped gap described below. Each assertion
  cites the specific Azurite file it was compared against
  (`dispatch.middleware.ts`, `IQueueHandler.ts`, `Context.ts`) in its own comment.
- **`../../../tests/typespec-emitter-pilot/pilotServer.e2e.test.ts`** — the real end-to-end proof:
  starts `createPilotServer`'s Express app on an ephemeral port and drives it with genuine HTTP
  requests (Node's global `fetch`) against the **real** Queue routes — queue create /
  get-properties / set-metadata, service-level list-queues / get-properties, and a full message
  lifecycle (send → peek → receive → update → delete) — including real same-path/same-verb
  disambiguation (e.g. `PUT /{queueName}` vs. `PUT /{queueName}?comp=metadata` vs.
  `?comp=acl`; `GET /{queueName}/messages` vs. `?peekonly=true`), asserting the full path — HTTP
  request → generated-metadata dispatch → hand-written handler logic → generated-metadata
  response shaping → real HTTP response — works end to end against the real spec's shape.

## What this proves

- The pilot emitter compiles the **real, unmodified, full Storage Queue TypeSpec** (not a toy
  subset) plus a real `azurite.tsp` overlay with **zero diagnostics**, generating all 17
  operations' models, route metadata, and handler interface.
- That generated output **compiles cleanly** under Azurite's own `tsconfig`/`tsc`/`ts-node` setup
  with no pilot-specific build tooling.
- A hand-written server implementation can **actually be built on top of the generated
  metadata and types** and serve real HTTP traffic against the real spec's actual routes,
  parameter names, and response headers — not just structurally resemble them in isolation.
- The generated handler interface's method shape — `(params, context) => Promise<Response>` —
  matches the calling convention of Azurite's real `I*Handler` interfaces, and is genuinely
  `implements`-able by hand-written business logic, including all 17 real operations.

## What this surfaced (the most important finding)

**`{queueName}` is not an HTTP operation parameter anywhere in the real spec.** Queue-scoped
operations (`Create`, `QueueGetProperties`, `Delete`, `SetMetadata`, `GetAccessPolicy`,
`SetAccessPolicy`, and all message operations) have paths like `/`, `/messages`,
`?comp=metadata` with **no mention of queueName at all** — the real spec resolves the queue name
via the `QueueClient`'s base URL (a TCGC `@clientInitialization`/client-scoped-path concept), not
as a per-operation HTTP parameter. A pilot emitter that (by design, matching the original pilot
scope) walks only `@typespec/http` — not TCGC's client-initialization model — **cannot see this
at all**: it is structurally absent from the generated `operations` metadata, not merely omitted
by a bug. `server/dispatcher.ts`'s `QUEUE_SCOPED_OPERATIONS` is a hand-written, hardcoded
classification working around this; `generatedArtifacts.test.ts` has an explicit test pinning
down this absence so the gap can't silently regress. A real migration would need either (a)
emitter support for walking TCGC client-initialization path parameters, or (b) Azurite's own
dispatcher continuing to apply this exact convention by hand, the way it effectively already does
today.

Two smaller, secondary findings, neither an emitter bug — both are properties of the real spec
itself:

- Several operations share the same (verb, path) and are disambiguated only by a **literal query
  string baked directly into `@route`** (e.g. `@route("?comp=metadata")`,
  `@route("messages?peekonly=true")`). The generated `operations[].path` honestly includes this
  literal text; `dispatcher.ts`'s `splitPathAndLiteralQuery`/`matchCandidate` parse it out and
  pick the best-matching operation per request — the same kind of collision-handling
  `dispatch.middleware.ts`'s `isRequestAgainstOperation` already does for the AutoRest-generated
  surface.
- `metadata` renders as a single `string` header (wire name `x-ms-meta`), not a
  `Record<string,string>` dictionary — because that's how `models.tsp`'s `MetadataHeaders` alias
  itself declares it. Real clients presumably synthesize multiple `x-ms-meta-{key}` headers
  client-side, a detail invisible at this TypeSpec layer.

## What this does **not** prove / explicitly out of scope

- This does **not** replace any file under `src/queue/generated/**` or wire into Azurite's real
  Express middleware/dispatch pipeline/auth/persistence layers — `server/` is a new, separate,
  parallel pilot implementation, not a modification of Azurite's production Queue handling.
  Swapping the real Queue surface over to a TypeSpec-generated contract is follow-on work for a
  real collaboration, not this pilot.
- **No XML (de)serialization.** The real spec's bodies are `application/xml`; this pilot's
  handler/dispatcher/tests only ever deal in plain JS objects over JSON, as an explicitly
  documented stand-in for the real wire format.
- No OData/Table-specific or Blob-specific behavior is modeled — only Queue.
- No attempt was made to match Azurite's exact `msRest` mapper/serializer format
  (`parameters.ts`/`specifications.ts`); the pilot's metadata shape is deliberately simpler and
  emitter-native rather than a byte-for-byte clone of the AutoRest-generated format.
- Parameter *type* coercion (e.g. turning a query string into a `number`) is hand-written and
  hardcoded by parameter name in `dispatcher.ts` rather than driven by generated metadata, since
  the generated `OperationParameterBinding` doesn't carry a type tag — noted as a candidate
  follow-up enhancement to the emitter.
- The queue-scoped-vs-service-scoped operation classification (`QUEUE_SCOPED_OPERATIONS`) is
  hardcoded by operation name, not derived from any generated metadata — see "What this
  surfaced" above; this is the single biggest piece of follow-up work for a real migration.
- No auth, no persistence, no concurrency/lease semantics, no account-level quota/throttling.

This PR is intended purely to let the Azurite team run/inspect the pilot's generated code —
driving a real hand-written server with it against the real spec — inside their own toolchain and
give feedback, ahead of any decision to invest further in this direction. It is **not intended to
be merged as-is**.
