import chalk from "chalk";
import os from "os";
import env from "./env";

export const asciiGreeting = () => {
  // TODO: const version  from "./../../package.json").version;

  const version = "1.0";
  let art = `
 _______                   _
(_______)                 (_)  _
 _______ _____ _   _  ____ _ _| |_ _____
|  ___  (___  ) | | |/ ___) (_   _) ___ |
| |   | |/ __/| |_| | |   | | | |_| ____|
|_|   |_(_____)____/|_|   |_| \\__)_____)

`;
  art += "Azurite, Version " + version + os.EOL;
  art += "A lightweight server clone of Azure Storage" + os.EOL;
  // tslint:disable-next-line:no-console
  console.log(chalk.cyan(art));
};

export const blobStorageStatus = () => {
  // tslint:disable-next-line:no-console
  console.log(
    chalk.cyan(
      `Azure Blob Storage Emulator listening on port ${env.blobStoragePort}`
    )
  );
};

export const queueStorageStatus = () => {
  // tslint:disable-next-line:no-console
  console.log(
    chalk.cyan(
      `Azure Queue Storage Emulator listening on port ${env.queueStoragePort}`
    )
  );
};

export const tableStorageStatus = () => {
  // tslint:disable-next-line:no-console
  console.log(
    chalk.cyan(
      `Azure Table Storage Emulator listening on port ${env.tableStoragePort}`
    )
  );
};
