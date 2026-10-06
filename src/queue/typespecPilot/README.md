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

## Generated files

- `generated/models.ts`
- `generated/operations.ts`
- `generated/handlers.ts`

All 17 Queue operations generate with zero diagnostics and zero skipped operations. The generated
operation metadata includes method, path, literal query constraints, required query/header
parameters, request body content types, responses, and `interfaceName`.

## Azurite wiring in this PR

Only `src/queue/generated/middleware/dispatch.middleware.ts` is changed in the existing Queue
runtime. It uses `generated/operations.ts` to choose the existing `Operation` enum value, then the
rest of Azurite's Queue pipeline runs unchanged.

The handwritten logic is limited to the temporary bridge between Azurite's existing `Operation`
enum and the new generated operation metadata, plus the same request matching the old generated
dispatcher already performed.

## Known generated-library gaps surfaced by the wiring

- `GetUserDelegationKey` exists in the Storage Queue TypeSpec, but Azurite currently has no Queue
  handler or `Operation` enum member for it, so it remains unrouted.

## Tests

- `tests/typespec-emitter-pilot/generatedArtifacts.test.ts` validates the generated files.
- `tests/typespec-emitter-pilot/dispatchMiddleware.test.ts` validates dispatch matching.
- `tests/typespec-emitter-pilot/pilotServer.e2e.test.ts` boots the real Queue server and drives it
  with `@azure/storage-queue`.
