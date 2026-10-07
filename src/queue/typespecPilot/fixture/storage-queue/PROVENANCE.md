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
`generated/serialization.ts` were produced with:

- Emitter source: `Azure/typespec-azure#5614`
- Exact emitter commit: `954690e6be69a6dce45b1184017c8a267ae9a9e0`
- Emitter package: `packages/typespec-azurite-emitter`

1. Fetching `main.tsp`, `models.tsp`, `routes.tsp`, and `client.tsp` from the pinned commit above
   into this directory (temporarily, not committed).
2. Linking this temporary fixture's `node_modules` entries to the matching packages in the exact
   `typespec-azure` checkout.
3. Building `@azure-tools/typespec-azurite-emitter` and running:

   ```sh
   mise exec -- pnpm --filter @typespec/compiler exec tsp compile \
     "$AZURITE_ROOT/src/queue/typespecPilot/fixture/storage-queue/azurite.tsp" \
     --emit @azure-tools/typespec-azurite-emitter \
     --option @azure-tools/typespec-azurite-emitter.outputDir=../.. \
     --option @azure-tools/typespec-azurite-emitter.runtimeImport=../runtime/serializationRuntime \
     --output-dir "$AZURITE_ROOT/src/queue/typespecPilot/generated"
   ```

   from the root of the exact `typespec-azure` checkout. Before compiling, build the emitter with:

   ```sh
   mise exec -- pnpm --filter @azure-tools/typespec-azurite-emitter build
   ```

4. Removing the temporary spec files and dependency links. The emitted files are committed exactly
   as generated; no post-generation patch step is used.

The compile is **not** wired into this repo's own `npm install`/`npm run build` (Azurite does not
depend on the TypeSpec compiler toolchain). The generated `.ts` files are committed directly. To
regenerate after a spec or emitter change, repeat the three steps above from a checkout with both
this directory and the built emitter available.

**Result: all 17 real Queue operations (the `Service` and `Queue` interfaces' operations,
flattened into one `IServiceHandler`) build and render with zero diagnostics and zero skipped
operations.** The generated files also compile as part of Azurite's normal `npm run build`.
