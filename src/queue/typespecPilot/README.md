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

The handwritten logic is limited to the temporary bridge from Azurite's existing `Operation` enum
to same-named generated metadata and fallback wiring while old and new Queue generated layers
coexist.

## Known generated-library gaps surfaced by the wiring

- `GetUserDelegationKey` exists in the Storage Queue TypeSpec, but Azurite currently has no Queue
  handler or `Operation` enum member for it, so it remains unrouted.

## Tests

- `tests/typespec-emitter-pilot/generatedArtifacts.test.ts` validates the generated files.
- `tests/typespec-emitter-pilot/dispatchMiddleware.test.ts` validates dispatch matching.
- `tests/typespec-emitter-pilot/pilotServer.e2e.test.ts` boots the real Queue server and drives it
  with `@azure/storage-queue`.
