# TypeSpec-generated Queue artifacts

This folder shows the Queue artifacts produced by `@azure-tools/typespec-azurite-emitter` from:

1. the real Azure Storage Queue TypeSpec pinned in `fixture/storage-queue/PROVENANCE.md`, and
2. `fixture/storage-queue/azurite.tsp`, the Azurite-owned overlay.

The generated files are committed under `generated/` so this PR can run in Azurite's normal build
without adding a TypeSpec toolchain dependency.

## Overlay changes represented

`azurite.tsp` represents the Queue customizations documented in `swagger/queue.md`:

- Relax `VisibilityTimeoutParameter.visibilityTimeout` with `@@maxValue(..., 2147483647)`.
- Make `AccessPolicy.start`, `AccessPolicy.expiry`, and `AccessPolicy.permission` optional with
  `@@makeOptional`.
- Use TCGC `@@clientName` to align generated operation names with Azurite's existing `Operation`
  enum names where Azurite already has a handler.

## Generated files

- `generated/models.ts`
- `generated/operations.ts`
- `generated/handlers.ts`
- `generated/metadata.ts`
- `generated/serialization.ts`

All 17 Queue operations generate with zero diagnostics and zero skipped operations. The generated
operation metadata includes method, path, literal query constraints, required query/header
parameters, request body content types, responses, and `interfaceName`.

`models.ts` and `operations.ts` colocate compact runtime descriptors with the declarations they
describe. `metadata.ts` is a reference-only aggregator for those values, while `serialization.ts`
binds the consolidated manifest to `runtime/serializationRuntime.ts`. The handwritten runtime
owns stable request deserialization, response serialization, XML, primitive conversion,
path-context, and header-collection logic. Existing middleware continues importing the thin
generated module, so the routed Queue surface is exercised through the same public boundary.

## Azurite wiring in this PR

`src/queue/generated/middleware/dispatch.middleware.ts` uses `generated/metadata.ts` to choose
the existing `Operation` enum value. `deserializer.middleware.ts` and `serializer.middleware.ts`
prefer `generated/serialization.ts` functions, then fall back to the existing generated specs for
operations that are not represented in the generated Queue metadata.

`generatedHandlerBridge.ts` is the explicit temporary integration boundary between the generated
`IServiceHandler` and Azurite's existing Express middleware pipeline. It does not parse or
serialize HTTP data. The generated dispatch, deserializer, and serializer middleware retain those
responsibilities. The bridge only selects and invokes the generated handler method, passing the
generated parameter and response objects through unchanged. It can disappear once generated
handler invocation is integrated into Azurite's runtime.

Azurite's production Queue server still uses the legacy split AutoRest handlers. Its existing
`HandlerMiddlewareFactory` contains the separate compatibility boundary that adapts the finalized
generated parameter/response object shapes to those legacy handlers. This compatibility step is
not used by the handwritten generated-interface E2E server and can be removed when the production
handlers implement the generated `IServiceHandler`.

The legacy Queue generation is 32 TypeScript files (6,003 lines); every file has a direct or
transitive production consumer today, so none can be safely deleted in this pilot. The new output
uses one operation metadata table and a thin runtime binding instead of per-operation switches or
emitted generic helper implementations. This follows the stable handwritten-runtime/thin
service-output boundary used by `http-client-js` without copying its implementation.

The original finalized TypeSpec output was 4 files / 4,316 lines, including 1,249 lines in
`serialization.ts`. Compact colocated descriptors, a reference-only manifest, and the shared
runtime reduce generated output to 5 files / 1,856 lines: 228 handler, 19 metadata, 648 model, 950
operation, and 11 serialization lines. Numeric wire constraints bring the final generated output
to 2,140 lines: 230 handler, 17 metadata, 687 model, 1,193 operation, and 13 serialization lines.
The handwritten runtime is 909 lines, making generated plus runtime code 3,049 lines. The
reduction is therefore 2,176 generated lines (50%) and 1,267 total lines (29%); it is not achieved
by hiding an equivalent duplicate implementation outside
`generated/`.

## Known generated-library gaps surfaced by the wiring

- `GetUserDelegationKey` exists in the Storage Queue TypeSpec, but Azurite currently has no Queue
  handler or `Operation` enum member for it, so it remains unrouted.
- Azurite's legacy `Queue_GetPropertiesWithHead` and `Queue_GetAccessPolicyWithHead` operations are
  absent from the pinned Queue TypeSpec source. The dispatcher retains two compatibility metadata
  entries until the source spec or Azurite overlay defines those HEAD operations.

## Tests

- `tests/typespec-emitter-pilot/generatedArtifacts.test.ts` validates the generated files.
- `tests/typespec-emitter-pilot/dispatchMiddleware.test.ts` validates dispatch matching.
- `tests/typespec-emitter-pilot/generatedHandlerBridge.e2e.test.ts` boots an ephemeral Express
  server using the real generated dispatch/deserializer/serializer/end middleware and a handwritten
  generated `IServiceHandler`. It verifies XML request parsing, typed query/header values, exact
  handler parameters, decoded path parameters, XML response wire names and escaping, response
  headers/status, and an error response variant.
- `tests/typespec-emitter-pilot/pilotServer.e2e.test.ts` boots the real Queue server and drives it
  with `@azure/storage-queue`.
