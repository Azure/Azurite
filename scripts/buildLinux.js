// This is an experimental feature, currently support to linux is limited to Ubuntu / debian based systems
// What to do if you find a bug ?
// Check if you don't observe this behavior on Windows builds. If you are sure that it's only on Linux
// raise a bug on linux binaries.
const path = require('path');
const fs = require('fs');
const { cpSync, chmodSync, existsSync, mkdirSync } = require('fs');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');
const {
  loadSeaManifest,
  enforceNoEmbeddedAssets,
  runEsbuildAudit,
  auditDynamicImports,
  seaBundleExternals
} = require('./seaBuildUtils');

const SEA_BLOB_SECTION = 'NODE_SEA_BLOB';
const SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const tempDir = path.resolve('./temp');
const releaseDir = path.resolve('./release');
const distEntry = path.resolve('./dist/src/azurite.js');
const isAuditOnly = process.argv.includes('--audit');

if (process.platform === 'linux') {
  build().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
} else {
  throw new Error(`Cannot build Linux binaries on ${process.platform}. Run this script on Linux, or use buildExe.js for Windows builds.`);
}

async function build() {
  const manifest = loadSeaManifest();
  enforceNoEmbeddedAssets(manifest);

  ensureDir(tempDir);
  ensureDir(releaseDir);
  ensureBuildOutput();

  if (isAuditOnly) {
    await runAudit();
    console.log('SEA audit passed.');
    return;
  }

  const seaBundlePath = path.join(tempDir, 'azurite.sea.bundle.cjs');
  const seaBlobPath = path.join(tempDir, 'azurite-prep.blob');
  const seaConfigPath = path.join(tempDir, 'sea-config.linux.json');
  const outputBinary = path.resolve('./release/azuritelinux');

  await bundleForSea(seaBundlePath);

  fs.writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: seaBundlePath,
        output: seaBlobPath,
        disableExperimentalSEAWarning: true
      },
      null,
      2
    )
  );

  run(process.execPath, ['--experimental-sea-config', seaConfigPath]);

  cpSync(process.execPath, outputBinary);
  injectSeaBlob(outputBinary, seaBlobPath);
  chmodSync(outputBinary, 0o755);

  console.log(`Built ${outputBinary}`);
}

async function runAudit() {
  await runEsbuildAudit(distEntry, `node${process.versions.node.split('.')[0]}`);
  auditDynamicImports(path.resolve('./dist/src'));
}

async function bundleForSea(outputPath) {
  await esbuild.build({
    entryPoints: [distEntry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: [`node${process.versions.node.split('.')[0]}`],
    external: seaBundleExternals,
    outfile: outputPath,
    sourcemap: false,
    minify: false
  });
}

function ensureBuildOutput() {
  if (!existsSync(distEntry)) {
    throw new Error("Missing dist/src/azurite.js. Run 'npm run build' first.");
  }
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function injectSeaBlob(binaryPath, blobPath) {
  const postjectBin = path.resolve('./node_modules/.bin/postject');
  if (!existsSync(postjectBin)) {
    throw new Error("Missing 'postject'. Run 'npm install' before building binaries.");
  }

  run(postjectBin, [binaryPath, SEA_BLOB_SECTION, blobPath, '--sentinel-fuse', SEA_SENTINEL_FUSE]);
}

function run(command, args) {
  const isCmdScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: isCmdScript });
  if (result.error) {
    throw new Error(`Command failed to start: ${command} ${args.join(' ')}\n${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${command} ${args.join(' ')}`);
  }
}
