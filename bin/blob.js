#!/usr/bin/env node

"use strict";

const BbPromise = require("bluebird");

process.on("unhandledRejection", (e) => {
  console.error(
    "**PANIC** Something unexpected happened! Blob Storage Emulator may be in an inconsistent state!"
  );
  console.error(e);
});
process.noDeprecation = true;

(() =>
  BbPromise.resolve()
    .then(() => {
      // requiring here so that if anything went wrong,
      // during require, it will be caught.
      const argv = require("minimist")(process.argv.slice(2));
      const A = require("../lib/AzuriteBlob"),
        azurite = new A();
      azurite.init(argv);
    })
    .catch((e) => {
      process.exitCode = 1;
      console.error(e);
    }))();
