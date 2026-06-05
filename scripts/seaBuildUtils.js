const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const esbuild = require('esbuild');

const manifestPath = path.resolve('./scripts/sea-assets-manifest.json');
const optionalExternalModules = [
  'pg',
  'pg-hstore',
  'pg-native',
  'sqlite3',
  'better-sqlite3',
  'mariadb',
  'oracledb',
  'ibm_db',
  '@sap/hana-client',
  'snowflake-sdk'
];

const nodeBuiltinExternals = Array.from(
  new Set(
    builtinModules
      .filter((name) => !name.startsWith('_'))
      .flatMap((name) => [name, `node:${name}`])
  )
);

const seaBundleExternals = [...optionalExternalModules, ...nodeBuiltinExternals];

function loadSeaManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing SEA asset manifest: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  if (!Array.isArray(manifest.embeddedAssets)) {
    throw new Error('SEA asset manifest must contain an embeddedAssets array.');
  }

  if (!Array.isArray(manifest.externalRuntimeAssets)) {
    throw new Error('SEA asset manifest must contain an externalRuntimeAssets array.');
  }

  if (typeof manifest.requiresEmbeddedAssets !== 'boolean') {
    throw new Error('SEA asset manifest must contain requiresEmbeddedAssets boolean.');
  }

  return manifest;
}

function enforceNoEmbeddedAssets(manifest) {
  if (manifest.requiresEmbeddedAssets || manifest.embeddedAssets.length > 0) {
    throw new Error(
      'This SEA build currently supports no embedded assets. ' +
      'Keep scripts/sea-assets-manifest.json with requiresEmbeddedAssets=false and an empty embeddedAssets array.'
    );
  }
}

async function runEsbuildAudit(distEntry, target) {
  await esbuild.build({
    entryPoints: [distEntry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: [target],
    external: seaBundleExternals,
    write: false,
    logLevel: 'silent'
  });
}

function auditDynamicImports(scanRootDir) {
  const jsFiles = listJsFiles(scanRootDir);
  const findings = [];

  const checks = [
    {
      name: 'dynamic require() argument',
      regex: /\brequire\(\s*(?!["'`])[^)]+\)/
    },
    {
      name: 'template-based require() argument',
      regex: /\brequire\(\s*`[^`]*\$\{[^`]*\}[^`]*`\s*\)/
    },
    {
      name: 'dynamic import() argument',
      regex: /\bimport\(\s*(?!["'`])[^)]+\)/
    },
    {
      name: 'template-based import() argument',
      regex: /\bimport\(\s*`[^`]*\$\{[^`]*\}[^`]*`\s*\)/
    }
  ];

  for (const filePath of jsFiles) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const check of checks) {
        if (check.regex.test(lines[i])) {
          findings.push(`${filePath}:${i + 1} ${check.name}`);
        }
      }
    }
  }

  if (findings.length > 0) {
    const preview = findings.slice(0, 20).join('\n');
    const suffix = findings.length > 20 ? `\n...and ${findings.length - 20} more` : '';
    throw new Error(`SEA audit failed. Dynamic import patterns found:\n${preview}${suffix}`);
  }
}

function listJsFiles(rootDir) {
  const files = [];
  walk(rootDir, files);
  return files;
}

function walk(dirPath, files) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
}

module.exports = {
  loadSeaManifest,
  enforceNoEmbeddedAssets,
  runEsbuildAudit,
  auditDynamicImports,
  optionalExternalModules,
  seaBundleExternals
};
