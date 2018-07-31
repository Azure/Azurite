import * as minimist from "minimist";
import * as cli from "./../lib/core/cli";
import Environment from "./../lib/core/env";

process.on("unhandledRejection", e => {
  // tslint:disable-next-line:no-console
  console.error(
    "**PANIC** Something unexpected happened! Emulator may be in an inconsistent state!"
  );
  // tslint:disable-next-line:no-console
  console.error(e);
});

(() => {
  try {
    // requiring here so that if anything went wrong,
    // during require, it will be caught.
    const argv = minimist(process.argv.slice(2));

    return Environment.init(argv)
      .then(() => {
        if (!Environment.silent) {
          cli.asciiGreeting();
        }
      })
      .then(() => {
        // Forking individual modules to spread them across different cores if possible
        // and restarting them automatically in case of a crash.
        const fork = require("child_process").fork;

        (function forkBlobModule(code, signal) {
          const mod = fork(Environment.blobModulePath, process.argv);
          mod.on("exit", forkBlobModule);
        })();
        (function forkQueueModule(code, signal) {
          const mod = fork(Environment.queueModulePath, process.argv);
          mod.on("exit", forkQueueModule);
        })();
        (function forkTableModule(code, signal) {
          const mod = fork(Environment.tableModulePath, process.argv);
          mod.on("exit", forkTableModule);
        })();
      });
  } catch (e) {
    process.exitCode = 1;
    // tslint:disable-next-line:no-console
    console.error(e);
  }
})();

// If this is a child process (e.g. forked by NPM through '$ npm start') we are propagating the signals from the
// parent (i.e. NPM) to exit from this process and its child processes.
process.on("SIGINT", () => {
  // e.g. STRG+C
  process.exitCode = 1;
  process.exit();
});

process.on("SIGTERM", () => {
  // e.g. end process from taskmanager
  process.exitCode = 1;
  process.exit();
});
