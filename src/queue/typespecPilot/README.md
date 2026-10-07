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
- `generated/serialization.ts`

All 17 Queue operations generate with zero diagnostics and zero skipped operations. The generated
operation metadata includes method, path, literal query constraints, required query/header
parameters, request body content types, responses, and `interfaceName`.

`serialization.ts` adds generated request deserializer and response serializer functions for Queue
operations, including XML request/response body helpers for Queue models. Azurite uses these
functions before the legacy AutoRest specs, so the routed Queue surface is exercised through the
TypeSpec-generated path.

## Azurite wiring in this PR

`src/queue/generated/middleware/dispatch.middleware.ts` uses `generated/operations.ts` to choose
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
is four files (4,316 lines). It uses metadata lookup instead of per-operation serialization
switches. A follow-up can reduce per-service output further by moving stable serialization/XML
helpers into an Azurite-owned shared runtime, following the static-helper boundary used by
`http-client-js`.

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
