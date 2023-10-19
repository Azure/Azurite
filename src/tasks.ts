import * as vscode from "vscode";

import VSCServerManagerBlob from "./common/VSCServerManagerBlob";
import VSCServerManagerQueue from "./common/VSCServerManagerQueue";
import VSCServerManagerTable from "./common/VSCServerManagerTable";
import { ServerStatus } from "./common/ServerBase";
import VSCServerManagerBase from "./common/VSCServerManagerBase";

interface Action {
  name: string;
  command: string;
  preCheck?: (writeEmitter: vscode.EventEmitter<string>) => Promise<boolean>;
}

interface AzuriteTaskDefinition extends vscode.TaskDefinition {
  action: string;
}

export class AzuriteTaskProvider implements vscode.TaskProvider {
  static AzuriteTaskType = "azurite";

  private tasks: vscode.Task[] | undefined;
  private actions: Record<string, Action>;

  constructor(
    blobManager: VSCServerManagerBlob,
    queueManager: VSCServerManagerQueue,
    tableManager: VSCServerManagerTable
  ) {
    this.actions = {
      start: {
        name: "Start All",
        command: "azurite.start"
        // NOTE no pre-check here as starting all services doesn't give an error if they're already running
      },
      close: {
        name: "Close All",
        command: "azurite.close"
      },
      clean: {
        name: "Clean All",
        command: "azurite.clean"
      },
      "blob.start": {
        name: "Start Blob Server",
        command: blobManager.getStartCommand(),
        preCheck: this.createPreCheck(
          blobManager,
          ServerStatus.Running,
          "Blob server is already running.\r\n"
        )
      },
      "blob.close": {
        name: "Close Blob Server",
        command: blobManager.getCloseCommand(),
        preCheck: this.createPreCheck(
          blobManager,
          ServerStatus.Closed,
          "Blob server is already closed.\r\n"
        )
      },
      "blob.clean": {
        name: "Clean Blob Server",
        command: blobManager.getCleanCommand()
      },
      "queue.start": {
        name: "Start Queue Server",
        command: queueManager.getStartCommand(),
        preCheck: this.createPreCheck(
          queueManager,
          ServerStatus.Running,
          "Queue server is already running.\r\n"
        )
      },
      "queue.close": {
        name: "Close Queue Server",
        command: queueManager.getCloseCommand(),
        preCheck: this.createPreCheck(
          queueManager,
          ServerStatus.Closed,
          "Queue server is already closed.\r\n"
        )
      },
      "queue.clean": {
        name: "Clean Queue Server",
        command: queueManager.getCleanCommand()
      },
      "table.start": {
        name: "Start Table Server",
        command: tableManager.getStartCommand(),
        preCheck: this.createPreCheck(
          tableManager,
          ServerStatus.Running,
          "Table server is already running.\r\n"
        )
      },
      "table.close": {
        name: "Close Table Server",
        command: tableManager.getCloseCommand(),
        preCheck: this.createPreCheck(
          tableManager,
          ServerStatus.Closed,
          "Table server is already closed.\r\n"
        )
      },
      "table.clean": {
        name: "Clean Table Server",
        command: tableManager.getCleanCommand()
      }
    };
  }

  /**
   * Create a pre-check function for a task. Used to avoid showing an error when starting a service that is already running.
   * @param manager
   * @param checkStatus
   * @param message
   * @returns
   */
  private createPreCheck(
    manager: VSCServerManagerBase,
    checkStatus: ServerStatus,
    message: string
  ) {
    return async (writeEmitter: vscode.EventEmitter<string>) => {
      const server = manager.getServer();
      if (server?.getStatus() === checkStatus) {
        writeEmitter.fire(message);
        return false;
      }
      return true;
    };
  }

  provideTasks(): vscode.ProviderResult<vscode.Task[]> {
    return this.getTasks();
  }
  private getTasks() {
    if (!this.tasks) {
      this.tasks = Object.keys(this.actions).map((actionKey) => {
        const definition: AzuriteTaskDefinition = {
          type: AzuriteTaskProvider.AzuriteTaskType,
          action: actionKey
        };
        const action = this.actions[actionKey];
        return new vscode.Task(
          definition,
          vscode.TaskScope.Workspace,
          actionKey,
          AzuriteTaskProvider.AzuriteTaskType,
          new vscode.CustomExecution(
            async (): Promise<vscode.Pseudoterminal> => {
              return new AzuriteTaskTerminal(action);
            }
          )
        );
      });
    }
    return this.tasks;
  }

  resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
    const actionName = task.definition.action as string;
    if (!actionName) {
      return undefined;
    }
    const resolvedTask = this.getTasks().find(
      (t) => t.definition.action === actionName
    );
    return resolvedTask;
  }
}

class AzuriteTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;

  private action: Action;

  constructor(action: Action) {
    this.action = action;
  }
  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.start();
  }
  close(): void {}

  private async start(): Promise<void> {
    if (this.action.preCheck) {
      const shouldContinue = await this.action.preCheck(this.writeEmitter);
      if (!shouldContinue) {
        this.closeEmitter.fire(0);
        return;
      }
    }
    this.writeEmitter.fire(this.action.name + "\r\n");
    await vscode.commands.executeCommand(this.action.command);
    this.writeEmitter.fire("Done!\r\n");
    this.closeEmitter.fire(0);
  }
}
