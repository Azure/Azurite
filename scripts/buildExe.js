const path = require('path');
const fs = require('fs');
const { cpSync, chmodSync, existsSync, mkdirSync } = fs;
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');
const rcedit = require('rcedit');
const pjson = require('../package.json');
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

build().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

async function build() {
  if (process.platform !== 'win32') {
    throw new Error('Cannot build Windows binaries on non-Windows platform.');
  }

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
  const seaConfigPath = path.join(tempDir, 'sea-config.win.json');
  const outputExe = path.resolve('./release/azurite.exe');

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

  cpSync(process.execPath, outputExe);
  removeAuthenticodeSignature(outputExe);

  await rcedit(outputExe, {
    'version-string': {
      CompanyName: 'Microsoft',
      ProductName: 'Azurite',
      FileDescription: 'Azurite',
      ProductVersion: pjson.version,
      OriginalFilename: "",
      InternalName: 'node',
      LegalCopyright: '© 2021 Microsoft. All rights reserved.'
    },
    icon: path.resolve('./icon.ico')
  });

  injectSeaBlob(outputExe, seaBlobPath);
  chmodSync(outputExe, 0o755);

  console.log(`Built ${outputExe}`);
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
    target: ['node24'],
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
  const postjectBin = path.resolve('./node_modules/.bin/postject.cmd');
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

function removeAuthenticodeSignature(binaryPath) {
  const bytes = fs.readFileSync(binaryPath);
  if (bytes.length < 0x40) {
    throw new Error(`File is too small to be a valid PE executable: ${binaryPath}`);
  }

  const peOffset = bytes.readUInt32LE(0x3c);
  if (peOffset + 26 > bytes.length) {
    throw new Error(`Invalid PE header offset ${peOffset} for file length ${bytes.length}: ${binaryPath}`);
  }

  if (bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error(`Missing PE signature at offset ${peOffset}: ${binaryPath}`);
  }

  const optionalHeaderStart = peOffset + 24;
  const optionalHeaderMagic = bytes.readUInt16LE(optionalHeaderStart);

  let dataDirectoryStart;
  if (optionalHeaderMagic === 0x10b) {
    dataDirectoryStart = optionalHeaderStart + 96;
  } else if (optionalHeaderMagic === 0x20b) {
    dataDirectoryStart = optionalHeaderStart + 112;
  } else {
    throw new Error(`Unsupported PE optional header magic: 0x${optionalHeaderMagic.toString(16)}`);
  }

  const securityDirectoryEntry = dataDirectoryStart + 8 * 4;
  if (securityDirectoryEntry + 8 > bytes.length) {
    throw new Error(
      `PE security directory entry is out of range: offset=${securityDirectoryEntry}, fileLength=${bytes.length}`
    );
  }

  const certTableFileOffset = bytes.readUInt32LE(securityDirectoryEntry);
  const certTableSize = bytes.readUInt32LE(securityDirectoryEntry + 4);

  // Clear IMAGE_DIRECTORY_ENTRY_SECURITY so no stale certificate pointer remains after postject.
  bytes.writeUInt32LE(0, securityDirectoryEntry);
  bytes.writeUInt32LE(0, securityDirectoryEntry + 4);

  if (certTableSize === 0) {
    fs.writeFileSync(binaryPath, bytes);
    return;
  }

  if (
    certTableFileOffset === 0 ||
    certTableFileOffset > bytes.length ||
    certTableSize > bytes.length - certTableFileOffset
  ) {
    throw new Error(
      `Invalid PE certificate table range: offset=${certTableFileOffset}, size=${certTableSize}, fileLength=${bytes.length}`
    );
  }

  bytes.fill(0, certTableFileOffset, certTableFileOffset + certTableSize);

  if (certTableSize > 0 && certTableFileOffset + certTableSize === bytes.length) {
    fs.writeFileSync(binaryPath, bytes.subarray(0, certTableFileOffset));
    return;
  }

  fs.writeFileSync(binaryPath, bytes);
}
