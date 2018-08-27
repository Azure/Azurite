#!/usr/bin/env node
import * as BbPromise from "bluebird";
import AzuriteBlob from "../lib/AzuriteBlob";

process.on("unhandledRejection", e => {
  // tslint:disable-next-line:no-console
  console.error(
    "**PANIC** Something unexpected happened! Blob Storage Emulator may be in an inconsistent state!"
  );
  // tslint:disable-next-line:no-console
  console.error(e);
});

(() =>
  BbPromise.resolve()
    .then(() => {
      // requiring here so that if anything went wrong,
      // during require, it will be caught.
      const argv = require("minimist")(process.argv.slice(2));
      const azuriteBlob = new AzuriteBlob();
      azuriteBlob.init(argv);
    })
    .catch(e => {
      process.exitCode = 1;
      // tslint:disable-next-line:no-console
      console.error(e);
    }))();
