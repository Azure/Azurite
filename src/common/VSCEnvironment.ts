import { access, ensureDir } from "fs-extra";
import { isAbsolute, resolve } from "path";
import { window, workspace, WorkspaceFolder } from "vscode";

import IEnvironment from "./IEnvironment";

export default class VSCEnvironment implements IEnvironment {
  public workspaceConfiguration = workspace.getConfiguration("azurite");

  public blobHost(): string | undefined {
    return this.workspaceConfiguration.get<string>("blobHost");
  }

  public blobPort(): number | undefined {
    return this.workspaceConfiguration.get<number>("blobPort");
  }

  public blobKeepAliveTimeout(): number | undefined {
    return this.workspaceConfiguration.get<number>("blobKeepAliveTimeout");
  }

  public queueHost(): string | undefined {
    return this.workspaceConfiguration.get<string>("queueHost");
  }

  public queuePort(): number | undefined {
    return this.workspaceConfiguration.get<number>("queuePort");
  }

  public queueKeepAliveTimeout(): number | undefined {
    return this.workspaceConfiguration.get<number>("queueKeepAliveTimeout");
  }

  public tableHost(): string | undefined {
    return this.workspaceConfiguration.get<string>("tableHost");
  }

  public tablePort(): number | undefined {
    return this.workspaceConfiguration.get<number>("tablePort");
  }

  public tableKeepAliveTimeout(): number | undefined {
    return this.workspaceConfiguration.get<number>("tableKeepAliveTimeout");
  }

  public async location(): Promise<string> {
    let location = this.workspaceConfiguration.get<string>("location");

    // When location configuration is not provided (or is relative), use current opened folder
    if (location === undefined || location === "" || !isAbsolute(location)) {
      if (
        workspace.workspaceFolders === undefined ||
        workspace.workspaceFolders.length === 0
      ) {
        // location = join(homedir(), "Azurite");
        throw Error(
          // tslint:disable-next-line:max-line-length
          `Invalid workspace location for Azurite. Please open a folder in Visual Studio Code, or provide a valid workspace folder path for Azurite in Visual Studio Code setting "azurite.location"`
        );
      }

      let folder: WorkspaceFolder | undefined;
      if (workspace.workspaceFolders.length > 1) {
        folder = await window.showWorkspaceFolderPick({
          placeHolder:
            "Select the working directory you wish to use as Azurite workspace location"
        });
        if (folder === undefined) {
          throw Error(
            // tslint:disable-next-line:max-line-length
            `Invalid workspace location for Azurite. Please select a folder in Visual Studio Code, or provide a valid workspace folder path for Azurite in Visual Studio Code setting "azurite.location"`
          );
        }
      } else {
        folder = workspace.workspaceFolders[0];
      }
      location = resolve(folder.uri.fsPath, location ?? '');
    }

    await ensureDir(location);
    await access(location);
    return location;
  }

  public silent(): boolean {
    return this.workspaceConfiguration.get<boolean>("silent") || false;
  }

  public loose(): boolean {
    return this.workspaceConfiguration.get<boolean>("loose") || false;
  }

  public skipApiVersionCheck(): boolean {
    return (
      this.workspaceConfiguration.get<boolean>("skipApiVersionCheck") || false
    );
  }

  public async debug(): Promise<boolean> {
    return this.workspaceConfiguration.get<boolean>("debug") || false;
  }

  public cert(): string | undefined {
    return this.workspaceConfiguration.get<string>("cert");
  }

  public key(): string | undefined {
    return this.workspaceConfiguration.get<string>("key");
  }

  public pwd(): string | undefined {
    return this.workspaceConfiguration.get<string>("pwd");
  }

  public oauth(): string | undefined {
    return this.workspaceConfiguration.get<string>("oauth");
  }

  public disableProductStyleUrl(): boolean {
    return (
      this.workspaceConfiguration.get<boolean>("disableProductStyleUrl") || false
    );
  }

  public inMemoryPersistence(): boolean {
    return this.workspaceConfiguration.get<boolean>("inMemoryPersistence") || false;
  }

  public extentMemoryLimit(): number | undefined {
    return this.workspaceConfiguration.get<number>("extentMemoryLimit");
  }

  public disableTelemetry(): boolean {
    return (
      this.workspaceConfiguration.get<boolean>("disableTelemetry") || false
    );
  }
}
