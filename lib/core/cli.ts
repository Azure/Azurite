

const os = require("os"),
    chalk = require("chalk"),
    env = require("./env");

exports.asciiGreeting = () => {
    const version = require("./../../package.json").version;
    let art =
`
 _______                   _
(_______)                 (_)  _
 _______ _____ _   _  ____ _ _| |_ _____
|  ___  (___  ) | | |/ ___) (_   _) ___ |
| |   | |/ __/| |_| | |   | | | |_| ____|
|_|   |_(_____)____/|_|   |_| \\__)_____)

`;
    art += "Azurite, Version " + version + os.EOL;
    art += "A lightweight server clone of Azure Storage" + os.EOL;
    console.log(chalk.cyan(art));
};

exports.blobStorageStatus = () => {
    console.log(chalk.cyan(`Azure Blob Storage Emulator listening on port ${env.blobStoragePort}`));
};

exports.queueStorageStatus = () => {
    console.log(chalk.cyan(`Azure Queue Storage Emulator listening on port ${env.queueStoragePort}`));
};

exports.tableStorageStatus = () => {
    console.log(chalk.cyan(`Azure Table Storage Emulator listening on port ${env.tableStoragePort}`));
};