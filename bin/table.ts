#!/usr/bin/env node

'use strict';
import minimist from 'minimist';
import AzuriteTable from '../lib/AzuriteTable';
import * as BbPromise from 'bluebird';

process.on("unhandledRejection", (e) => {
  console.error(
    "**PANIC** Something unexpected happened! Table Storage Emulator may be in an inconsistent state!"
  );
  console.error(e);
});
process.noDeprecation = true;

(() => BbPromise.resolve().then(() => {
	// requiring here so that if anything went wrong,
	// during require, it will be caught.
	const argv = minimist(process.argv.slice(2));
	const azurite = new AzuriteTable();
	azurite.init(argv);
}).catch(e => {
	process.exitCode = 1;
	console.error(e);
}))();