#!/usr/bin/env node

'use strict';

import minimist from 'minimist';
import AzuriteBlob from '../lib/AzuriteBlob';
import * as BbPromise from 'bluebird';

process.on('unhandledRejection', (e) => {
	console.error('**PANIC** Something unexpected happened! Blob Storage Emulator may be in an inconsistent state!');
	console.error(e);
});
process.noDeprecation = true;

(() => BbPromise.resolve().then(() => {
	// requiring here so that if anything went wrong,
	// during require, it will be caught.
	const argv = minimist(process.argv.slice(2));
	const azurite = new AzuriteBlob();
	azurite.init(argv);
}).catch(e => {
	process.exitCode = 1;
	console.error(e);
}))();