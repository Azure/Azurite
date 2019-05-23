import { window, workspace, WorkspaceFolder } from "vscode";

import IEnvironment from "./IEnvironment";

export default class VSCEnvironment implements IEnvironment {
  private workspaceConfiguration = workspace.getConfiguration("azurite");

  public blobHost(): string | undefined {
    return this.workspaceConfiguration.get<string>("blobHost");
  }

  public blobPort(): number | undefined {
    return this.workspaceConfiguration.get<number>("blobPort");
  }

  public async location(): Promise<string> {
    let location = this.workspaceConfiguration.get<string>("location");

    // When location configuration is not provided, use current opened folder
    if (location === undefined || location === "") {
      if (
        workspace.workspaceFolders === undefined ||
        workspace.workspaceFolders.length === 0
      ) {
        // location = join(homedir(), "Azurite");
        window.showWarningMessage(
          'Please open a folder, or provide a valid workspace path for Azurite in configuration "azurite.location"'
        );
        throw Error("Invalid workspace location for Azurite");
      }

      let folder: WorkspaceFolder | undefined;
      if (workspace.workspaceFolders.length > 1) {
        folder = await window.showWorkspaceFolderPick({
          placeHolder:
            "Select the working directory you wish to use as Azurite workspace location"
        });
        if (folder === undefined) {
          window.showWarningMessage(
            `Please select a folder, or provide a valid workspace path for Azurite in configuration "azurite.location"`
          );
          throw Error("Invalid workspace location for Azurite");
        }
      } else {
        folder = workspace.workspaceFolders[0];
      }
      location = folder.uri.fsPath;
    }

    return location;
  }

  public silent(): boolean {
    return this.workspaceConfiguration.get<boolean>("silent") || false;
  }

  public debug(): boolean {
    return this.workspaceConfiguration.get<boolean>("debug") || false;
  }
}
