# Provenance

`main.tsp`, `models.tsp`, `routes.tsp`, and `client.tsp` in this directory are a **byte-for-byte,
unmodified copy** of the Azure Storage Queue TypeSpec from `Azure/azure-rest-api-specs`:

- Source path: `specification/storage/data-plane/QueueStorage/{main,models,routes,client}.tsp`
- Source commit: `29f409cc6290bead39055e215558227bf641914b`

Intentionally **not** copied (not needed to compile/run the pilot emitter against this spec):
`examples/`, `readme.md`, `service.yaml`, `suppressions.yaml`, `tspconfig.yaml`, `stable/`.

`azurite.tsp` is a new overlay file (not part of the real spec) demonstrating Azurite's actual,
documented emulator-specific customizations from
[`Azure/Azurite`'s `swagger/queue.md`](https://github.com/Azure/Azurite/blob/main/swagger/queue.md)
("Changes Made to Client Swagger"), applied via TypeSpec augment decorators without editing the
vendored files above.

## Why vendor the real spec here (and not in the pilot emitter's own repo)

The pilot emitter package (`@azure-tools/typespec-azurite-emitter-pilot`, developed in
`Azure/typespec-azure`, see the companion PR linked from this repo's `typespec-emitter-pilot`
top-level README) deliberately keeps its own test fixtures small and self-contained. Validating
the emitter against the **real, full-size** Storage Queue spec — and proving the generated output
plugs into Azurite's actual runtime — happens here instead, in this end-to-end pilot, which is the
only place both halves (the real spec and Azurite's real handler/dispatcher conventions) are
present together.

## How the generated artifacts here were produced

`generated/models.ts`, `generated/operations.ts`, and `generated/handlers.ts` were produced by
running `tsp compile azurite.tsp` (in this directory) with
`@azure-tools/typespec-azurite-emitter-pilot` as the emitter, using the built package from the
companion `Azure/typespec-azure` PR. The compile is **not** wired into this repo's own
`npm install`/`npm run build` (Azurite does not depend on the TypeSpec compiler toolchain) — the
generated `.ts` files are committed directly, the same way this repo already commits
AutoRest-generated output under `src/queue/generated/`. To regenerate after a spec or emitter
change, re-run `tsp compile` from a checkout with both this directory and the built pilot emitter
available, and copy the output back into `generated/`.

**Result: all 17 real Queue operations (the `Service` and `Queue` interfaces' operations,
flattened into one `IServiceHandler`) build and render with zero diagnostics and zero skipped
operations.** Verified with a standalone `tsc --strict --noEmit` check of the three generated
files in isolation (no project-specific config), which also passes with zero errors.
