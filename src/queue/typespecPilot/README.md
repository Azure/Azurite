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

`serialization.ts` adds ms-rest-compatible operation specs for the first serializer/deserializer
slice: Queue operations with no request body and no successful response body. Azurite's existing
serializer helpers consume these specs for `Queue_Create`, `Queue_GetProperties`, `Queue_Delete`,
`Queue_SetMetadata`, `Messages_Clear`, and `MessageId_Delete`; body-heavy XML operations continue
to use the existing generated specs until TypeSpec body mapper generation is added.

## Azurite wiring in this PR

`src/queue/generated/middleware/dispatch.middleware.ts` uses `generated/operations.ts` to choose
the existing `Operation` enum value. `deserializer.middleware.ts` and `serializer.middleware.ts`
prefer `generated/serialization.ts` specs when the operation has one, then fall back to the
existing generated specs for unmigrated operations.

The handwritten logic is limited to the temporary bridge from Azurite's existing `Operation` enum
to same-named generated metadata, plus the same request matching and serializer helper runtime the
old generated code already used.

## Known generated-library gaps surfaced by the wiring

- `GetUserDelegationKey` exists in the Storage Queue TypeSpec, but Azurite currently has no Queue
  handler or `Operation` enum member for it, so it remains unrouted.

## Tests

- `tests/typespec-emitter-pilot/generatedArtifacts.test.ts` validates the generated files.
- `tests/typespec-emitter-pilot/dispatchMiddleware.test.ts` validates dispatch matching.
- `tests/typespec-emitter-pilot/pilotServer.e2e.test.ts` boots the real Queue server and drives it
  with `@azure/storage-queue`.
