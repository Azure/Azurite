#!/usr/bin/env node
/**
 * Minimal replacement for the cross-var package (which depends on Babel 6 /
 * babel-traverse, affected by CVE-2023-45133).
 *
 * Usage (identical to cross-var):
 *   node scripts/cross-var.js <command> [args...]
 *
 * All occurrences of $VAR_NAME in the command and arguments are substituted
 * with the corresponding environment-variable value before the command is
 * spawned, making it safe to reference npm lifecycle variables such as
 * $npm_package_version on Windows (cmd.exe / PowerShell) as well as Unix.
 */

'use strict';

const { spawnSync } = require('child_process');

const args = process.argv.slice(2);

if (args.length === 0) {
  process.stderr.write('cross-var.js: no command provided\n');
  process.exit(1);
}

// Replace every $VAR_NAME occurrence with its environment-variable value.
const expanded = args.map((arg) =>
  arg.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(process.env, name)
      ? process.env[name]
      : ''
  )
);

const [cmd, ...cmdArgs] = expanded;

// On Windows, npm and other CLI tools are .cmd batch files that cannot be
// found by spawnSync unless a shell is used to resolve them.
const result = spawnSync(cmd, cmdArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  process.stderr.write(`cross-var.js: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
