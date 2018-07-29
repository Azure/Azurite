import * as BbPromise from "bluebird";
import AzuriteTable from "../lib/AzuriteTable";

process.on("unhandledRejection", (e) => {
  console.error("**PANIC** Something unexpected happened! Table Storage Emulator may be in an inconsistent state!");
  console.error(e);
});

(() => BbPromise.resolve().then(() => {
  // requiring here so that if anything went wrong,
  // during require, it will be caught.
  const argv = from "minimist")(process.argv.slice(2));
  const azuriteTable = new AzuriteTable();
  azuriteTable.init(argv);
}).catch(e => {
  process.exitCode = 1;
  console.error(e);
}))();