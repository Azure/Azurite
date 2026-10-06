# Provenance

This directory does **not** vendor a copy of the real Azure Storage Queue TypeSpec. It only
contains `azurite.tsp`, the Azurite-specific overlay, which `import "./main.tsp"`s a file that is
**not present in this repo**. Instead, the base spec is pinned by commit hash, the same way you'd
pin any other out-of-repo dependency:

- Source: `Azure/azure-rest-api-specs`
- Source path: `specification/storage/data-plane/QueueStorage/{main,models,routes,client}.tsp`
- Pinned commit: `29f409cc6290bead39055e215558227bf641914b`

Not needed to compile/run the pilot emitter against this spec, and therefore never fetched even
when regenerating: `examples/`, `readme.md`, `service.yaml`, `suppressions.yaml`,
`tspconfig.yaml`, `stable/`.

## Why pin-by-hash instead of vendoring the files

Checking real Azure Storage TypeSpec source into Azurite's own repository would mean Azurite
carries a second, easily-stale copy of a spec it doesn't own. Pinning the exact commit (above)
and keeping only the Azurite-authored overlay (`azurite.tsp`) in-repo mirrors the actual migration
design this pilot is validating: the base Storage TypeSpec stays in `azure-rest-api-specs`,
unmodified and untouched, and Azurite owns only its own overlay file on top of it.

`azurite.tsp` is a real overlay (not part of the real spec) demonstrating Azurite's actual,
documented emulator-specific customizations from
[`Azure/Azurite`'s `swagger/queue.md`](https://github.com/Azure/Azurite/blob/main/swagger/queue.md)
("Changes Made to Client Swagger"), applied via TypeSpec augment decorators without ever editing
the pinned base spec.

## How the generated artifacts here were produced

`generated/models.ts`, `generated/operations.ts`, `generated/handlers.ts`, and
`generated/serialization.ts` were produced by:

1. Fetching `main.tsp`, `models.tsp`, `routes.tsp`, and `client.tsp` from the pinned commit above
   into this directory (temporarily, not committed).
2. Running `tsp compile azurite.tsp` in this directory with
   `@azure-tools/typespec-azurite-emitter` (built from the companion `Azure/typespec-azure#5614`
   PR) as the emitter.
3. Copying the generated output back into `generated/` and discarding the fetched `.tsp` files
   again, so only Azurite's own overlay stays in-repo.

The compile is **not** wired into this repo's own `npm install`/`npm run build` (Azurite does not
depend on the TypeSpec compiler toolchain). The generated `.ts` files are committed directly. To
regenerate after a spec or emitter change, repeat the three steps above from a checkout with both
this directory and the built emitter available.

**Result: all 17 real Queue operations (the `Service` and `Queue` interfaces' operations,
flattened into one `IServiceHandler`) build and render with zero diagnostics and zero skipped
operations.** Verified with a standalone `tsc --strict --noEmit` check of the three generated
files in isolation (no project-specific config), which also passes with zero errors.
