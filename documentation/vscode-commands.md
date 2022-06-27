You can quickly start or close Azurite by clicking Azurite **status bar item** or following commands.

Extension supports following Visual Studio Code commands:

- `Azurite: Start` Start all Azurite services
- `Azurite: Close` Close all Azurite services
- `Azurite: Clean` Reset all Azurite services persistency data
- `Azurite: Start Blob Service` Start blob service
- `Azurite: Close Blob Service` Close blob service
- `Azurite: Clean Blob Service` Clean blob service
- `Azurite: Start Queue Service` Start queue service
- `Azurite: Close Queue Service` Close queue service
- `Azurite: Clean Queue Service` Clean queue service
- `Azurite: Start Table Service` Start table service
- `Azurite: Close Table Service` Close table service
- `Azurite: Clean Table Service` Clean table service

Following extension configurations are supported:

- `azurite.blobHost` Blob service listening endpoint, by default 127.0.0.1
- `azurite.blobPort` Blob service listening port, by default 10000
- `azurite.queueHost` Queue service listening endpoint, by default 127.0.0.1
- `azurite.queuePort` Queue service listening port, by default 10001
- `azurite.tableHost` Table service listening endpoint, by default 127.0.0.1
- `azurite.tablePort` Table service listening port, by default 10002
- `azurite.location` Workspace location folder path (can be relative or absolute). By default, in the VS Code extension, the currently opened folder is used. If launched from the command line, the current process working directory is the default. Relative paths are resolved relative to the default folder.
- `azurite.silent` Silent mode to disable access log in Visual Studio channel, by default false
- `azurite.debug` Output debug log into Azurite channel, by default false
- `azurite.loose` Enable loose mode which ignores unsupported headers and parameters, by default false
- `azurite.cert` Path to a PEM or PFX cert file. Required by HTTPS mode.
- `azurite.key` Path to a PEM key file. Required when `azurite.cert` points to a PEM file.
- `azurite.pwd` PFX cert password. Required when `azurite.cert` points to a PFX file.
- `azurite.oauth` OAuth oauthentication level. Candidate level values: `basic`.
- `azurite.skipApiVersionCheck` Skip the request API version check, by default false.
- `azurite.disableProductStyleUrl` Force parsing storage account name from request Uri path, instead of from request Uri host.
