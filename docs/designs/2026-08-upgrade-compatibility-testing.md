# Upgrade / persistence compatibility regression testing

- Author Name: GitHub Copilot (on behalf of the Azurite team)
- GitHub Issue: N/A (internal test infrastructure improvement)

## Summary

Azurite persists blob, queue, and table data to disk (LokiJS + extent files). Users routinely upgrade
Azurite (npm package, Docker image, VS Code extension, standalone binary) in place, expecting data written
by an older version to remain readable after the upgrade. Today there is no automated regression coverage
for this scenario. This proposes a new `tests/upgrade/` suite plus a dedicated CI workflow that:

1. Installs the **latest currently-published** version of Azurite that is no newer than the
   local build (npm and/or MCR Docker image) - so a release-day run where the published
   version matches the local version still seeds with that (older code generation) release,
   while a stale local checkout never ends up testing a downgrade. The Marketplace VSIX is
   intentionally **not** capped this way; it is only exercised by the separate lifecycle test.
2. Seeds representative blob/queue/table data with it.
3. Replaces it with the **local build** (the code under test - could be an unreleased/local change).
4. Re-reads and byte-for-byte / value-for-value validates everything the old version wrote.
5. Separately validates the VS Code extension packaging lifecycle: install `.vsix`, activate, start
   all three services, stop them.

The design is intentionally **version-agnostic**: nothing hardcodes a specific "old" version number.
The suite always resolves "the latest version currently published" at run time, so it keeps working
release after release with zero maintenance.

## Goals / requirements covered

| #   | Requirement                                                               | Where it's covered                                                                  |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Create data with an older released version, upgrade, verify data survives | `tests/upgrade/blobUpgrade.test.ts`, `queueUpgrade.test.ts`, `tableUpgrade.test.ts` |
| 2   | Install vsix, activate, start, stop                                       | `tests/upgrade/vsixLifecycle/suite/vsixLifecycle.test.js`, `tests/upgrade/vsixLifecycle/upgradeSuite/` |
| 3   | Validate txt/json/csv/xml/binary                                          | `tests/upgrade/utils/dataFixtures.ts`                                               |
| 4   | Byte-for-byte blob integrity across versions                              | `tests/upgrade/utils/integrity.ts` (`sha256` + length compare)                      |
| 5   | Docker image upgrade (same mounted volume across image tags)              | `tests/upgrade/dockerUpgrade.test.ts`                                               |
| -   | Runs on demand locally + on every merge to `main`                         | `npm run test:upgrade*` scripts + `.github/workflows/UpgradeCompatibility.yml`      |

## Architecture

```mermaid
flowchart TD
    subgraph Resolve["Version resolution - zero hardcoded versions"]
        VR[versionResolver]
        VR -->|latest npm version| NI[npmVersionInstaller]
        VR -->|latest MCR tag| PI["dockerHarness: pullImage"]
        VR -->|latest Marketplace version| RV[resolveVsixToTest]
    end

    subgraph Targets["upgradeTarget.ts - one shared start/stop lifecycle"]
        UT[["UpgradeTarget interface\nstart() / stop()"]]
        NI --> NPT[NpmProcessTarget] -.implements.-> UT
        PI --> DCT[DockerContainerTarget] -.implements.-> UT
        NPT --> PH[processHarness: spawn node entry point]
        DCT --> DH[dockerHarness: run/stop container]
        DH --> HP[httpProbe: waitForHttpUp]
    end

    subgraph Fixtures["Shared fixture seed + verify - identical for npm and Docker"]
        DF[dataFixtures: blob/queue/table fixtures]
        DF --> BU["blobUploader: upload + assert\n(block/append/page)"]
        DF --> QM["queueClient: create + assert\n(enqueue/dequeue messages)"]
        DF --> TVC["tableValueCodec: create + assert\n(Int64/Guid/Binary typed props)"]
        BU --> IN[integrity: sha256 + byte-length compare]
        QM --> IN
    end

    UT -->|"1: start OLD target, seed via BU/TVC, stop"| Seed[seed phase]
    Seed -->|"2: start NEW target on same data dir"| Verify[verify phase]
    Verify -->|"3: BU/TVC/IN assertions"| Result([pass/fail])

    Seed -.used by.-> BT[blobUpgrade.test.ts]
    Seed -.used by.-> QT[queueUpgrade.test.ts]
    Seed -.used by.-> TT[tableUpgrade.test.ts]
    Seed -.used by.-> DT[dockerUpgrade.test.ts]
    Seed -.used by.-> VUT["vsixLifecycle/upgradeSuite\n(seed.test.js / verify.test.js)"]

    RV --> INSTALL["code --install-extension vsix"]
    INSTALL --> RUNTESTS["@vscode/test-electron runTests"]
    RUNTESTS --> DRIVER[driverExtension + suite: activate, azurite.start, HTTP probe, azurite.close]

    RV -->|"resolveMarketplaceVsixForUpgrade + packageLocalVsix"| VSU[runVsixUpgradeTest.ts]
    VSU -->|"1: install OLD (published) vsix, seed via BU/QM/TVC"| Seed
    Seed -->|"2: install NEW (local) vsix, same workspace"| Verify
```

The key structural point vs. an earlier draft: `blobUpgrade`, `queueUpgrade`, `tableUpgrade` and
`dockerUpgrade` no longer each hand-roll their own "start old / seed / stop / start new / verify"
plumbing. They all go through the same `UpgradeTarget` interface (`NpmProcessTarget` or
`DockerContainerTarget`) for lifecycle, and the same `blobUploader.ts` / `tableValueCodec.ts` for fixture
seeding and verification - so the Docker scenario is a drop-in alternate `UpgradeTarget`, not a parallel
implementation. Only the VSIX lifecycle test is structurally different, since its unit of work is a VS
Code Extension Host run rather than an HTTP-reachable server process.

### Directory layout

```
tests/upgrade/
  utils/
    versionResolver.ts     # resolves "latest published" npm/Marketplace/MCR versions dynamically
    npmVersionInstaller.ts # `npm install azurite@<version> --prefix <tmp>` into an isolated dir
    processHarness.ts       # generic start/stop of an Azurite CLI entry point (npm/local), ready-detection
    dockerHarness.ts        # thin `docker` CLI wrapper (pull/build/run/stop/rm)
    httpProbe.ts            # shared HTTP readiness polling, used by dockerHarness (and reusable elsewhere)
    upgradeTarget.ts         # `UpgradeTarget` interface + `NpmProcessTarget`/`DockerContainerTarget` adapters
    dataFixtures.ts         # txt/json/csv/xml/binary blob fixtures, queue + table entity fixtures
    blobUploader.ts         # uploads/verifies a `BlobFixture` via its declared blob type (block/append/page)
    tableValueCodec.ts      # builds/asserts typed table entity payloads (Int64/Guid/Binary wrapping+unwrapping)
    integrity.ts            # sha256 + byte-length compare, typed entity/message compare
  blobUpgrade.test.ts        # req 1, 4, 5
  queueUpgrade.test.ts       # req 1, 6
  tableUpgrade.test.ts       # req 1, 7
  vsixLifecycle/
    runVsixTests.ts          # outer driver: resolves+packages a vsix, downloads VS Code, runs suite
    resolveVsixToTest.ts     # local build vs. latest-published Marketplace vs. explicit version/path
    driverExtension/         # minimal no-op extension whose Extension Host runs the assertions
      package.json
      extension.js
    suite/
      index.js                # mocha loader (bdd)
      vsixLifecycle.test.js    # req 3: activate, start, stop, HTTP probes
  dockerUpgrade.test.ts       # req 8: pull latest published MCR image -> build+run local image, same bind-mounted volume
```

`versionResolver.ts` additionally exposes `getLatestPublishedDockerTag()`, which paginates the public MCR
tags API (`https://mcr.microsoft.com/v2/azure-storage/azurite/tags/list`) and picks the newest plain
semver tag that is no newer than the local version (excluding `-amd64`/`-arm64`/`-preview` suffixes and
`latest`).
`utils/dockerHarness.ts` wraps the `docker` CLI (`pull`/`build`/`run -d`/`stop`/`rm`); readiness polling
lives once in `utils/httpProbe.ts` rather than being duplicated per-harness.

`utils/upgradeTarget.ts` defines a single `UpgradeTarget` interface (`start()`/`stop()`) implemented by
both `NpmProcessTarget` (npm-installed/local process, wraps `processHarness.ts`) and
`DockerContainerTarget` (wraps `dockerHarness.ts`). Every test file (`blobUpgrade`, `queueUpgrade`,
`tableUpgrade`, `dockerUpgrade`) orchestrates its old-target/new-target lifecycle through this same
interface, so the "seed with old, stop, start new, verify" shape is identical whether the target is an
npm process or a Docker container - only the fixture seeding/verification code differs, and even that is
shared (see decision 7 below).

### Key design decisions

1. **No hardcoded versions.** `versionResolver.ts` queries the npm registry
   (`GET https://registry.npmjs.org/azurite`) and the MCR tags API for the newest version that is no
   newer than the local `package.json` version (see decision 2 for why this matters), and separately
   queries the Marketplace gallery API for the newest version, full stop - the Marketplace lookup is
   never capped against local, since it only selects which VSIX the lifecycle test installs/activates and
   never drives an old -> new persistence upgrade. This means the suite automatically "just works" on
   every future release without code changes.
2. **Same on-disk `--location` across generations.** Both the "old" and "new" Azurite processes point at
   the same temp data directory (`--location`), started sequentially (old first, seed, stop; new second,
   read, stop). This is what actually exercises the LokiJS/extent persistence upgrade path, rather than
   copying files around.
3. **Generation-agnostic process harness.** `processHarness.ts` doesn't know or care whether it's
   launching an npm-installed old version's `dist/src/azurite.js` or the local workspace's
   `dist/src/azurite.js` - it just spawns `node <entry> --blobPort ... --location ...` and waits for the
   standard "successfully listening" log lines already used by `exe.test.ts` / `linuxbinary.test.ts`.
4. **Byte-for-byte validation**, not just "no error thrown". Fixtures include text, JSON, CSV, XML and a
   deterministic pseudo-random binary blob, each uploaded as **block**, **append**, and **page** blobs
   where applicable. SHA-256 + length are compared before/after upgrade.
5. **True VSIX lifecycle test** using `@vscode/test-electron`, matching how the real user installs the
   extension (`code --install-extension azurite-x.y.z.vsix`) rather than only loading source via
   `extensionDevelopmentPath`. A tiny no-op "driver" extension provides the `extensionTestsPath` Extension
   Host entry point; it calls `vscode.commands.executeCommand("azurite.start" | "azurite.close")` on the
   already-installed real Azurite extension and probes the default ports over HTTP to confirm the server
   actually came up/down - this avoids command-id collisions that would happen if the driver extension
   also declared the same commands.
6. **Independent of run environment.** Everything runs against temp directories
   (`fs.mkdtempSync(os.tmpdir())`), so tests are hermetic and safe to run repeatedly, locally or in CI,
   without manual cleanup.
7. **One fixture-handling implementation, reused everywhere - including Docker.** `utils/blobUploader.ts`
   (`uploadBlobFixture` / `assertBlobFixtureSurvived`) and `utils/tableValueCodec.ts`
   (`toCreateEntityPayload` / `assertEntityMatchesFixture` / `unwrapTypedValue`) encapsulate the
   blob-type routing (block/append/page) and OData typed-property wrapping (Int64/Guid/Binary)
   respectively. `blobUpgrade.test.ts`, `tableUpgrade.test.ts` and `dockerUpgrade.test.ts` all call the
   same functions, so the Docker scenario exercises the identical fixture set as the npm scenario
   (all three blob types, all typed table properties) instead of a reduced subset - and any future fix to
   fixture handling (e.g. another OData type) only needs to happen in one place.

## npm scripts

```jsonc
"test:upgrade": "npm run build && mocha ... blobUpgrade.test.ts queueUpgrade.test.ts tableUpgrade.test.ts",
"test:upgrade:docker": "npm run build && mocha ... tests/upgrade/dockerUpgrade.test.ts",
"test:upgrade:vsix": "npm run build && node ... runVsixTests.ts && cross-env AZURITE_VSIX_UNDER_TEST=published-latest node ... runVsixTests.ts && node ... runVsixUpgradeTest.ts"
```

`test:upgrade:docker` is kept separate from `test:upgrade` (rather than a `tests/upgrade/*.test.ts` glob)
so that environments without Docker (e.g. plain local `npm test` runs) aren't forced to have it installed.
Unlike Docker, `test:upgrade:vsix` is a single script - like `test:upgrade` and `test:upgrade:docker` - that
chains all three VSIX phases (local lifecycle, published lifecycle, published->local upgrade) so there's
one command and one CI job per test area.

`AZURITE_VSIX_UNDER_TEST` controls which package is installed for the plain lifecycle phases of the VSIX
test (`runVsixTests.ts`; the upgrade phase always uses the published version for "old" and the local build
for "new", regardless of this variable):

- unset / `local` (default): package the current working tree with `vsce package`.
- `published-latest`: download the newest Marketplace-published VSIX.
- any other value: treated as an explicit version (downloaded from the Marketplace) or a path to an
  existing `.vsix` file.

## CI: `.github/workflows/UpgradeCompatibility.yml`

- Triggers: `push` to `main` (i.e. runs once a PR is merged, not on every PR push/sync) and
  `workflow_dispatch` (on-demand). Deliberately does **not** run on every `pull_request` event to avoid
  paying the npm-install / Docker-pull / VS Code download cost on every push to an open PR.
- Four jobs: `UpgradeCompatibility_Ubuntu` / `_Windows` (npm-based blob/queue/table upgrade tests),
  `VsixUpgrade_Ubuntu` (`xvfb-run`, since `@vscode/test-electron` needs a display; runs `test:upgrade:vsix`,
  which covers the plain lifecycle and the seed/verify upgrade scenario in one job), and
  `DockerImageUpgrade_Ubuntu` (Docker is preinstalled on GitHub-hosted Ubuntu runners).
- Jobs require network egress to `registry.npmjs.org`, `marketplace.visualstudio.com`, and
  `mcr.microsoft.com`.

## Follow-ups / explicitly out of scope for this first iteration

- SQL-backed metadata store upgrade (`AZURITE_TEST_DB`) - the initial suite targets the default LokiJS
  persistence; SQL persistence upgrade can be added as a parallel scenario file reusing the same fixtures.
- Re-adding a nightly `schedule` trigger is a one-line change if the team wants to also catch newly
  published npm/Marketplace/MCR releases outside of a merge to `main`.
