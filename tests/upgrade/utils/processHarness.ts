import { ChildProcess, spawn } from "child_process";

export interface AzuriteProcessOptions {
  /** Path to the Node entry point to run, e.g. dist/src/azurite.js. */
  entryPoint: string;
  args: string[];
  cwd?: string;
}

/**
 * Generation-agnostic wrapper around an Azurite CLI process. It doesn't know
 * or care whether `entryPoint` belongs to an npm-installed older version or
 * the local workspace build - it just spawns `node <entryPoint> <args>` and
 * waits for the well-known "successfully listening" log lines, mirroring the
 * pattern already used by tests/exe.test.ts and tests/linuxbinary.test.ts.
 */
export class AzuriteProcessHandle {
  private child?: ChildProcess;
  private output = "";

  constructor(private readonly options: AzuriteProcessOptions) {}

  async start(
    readyPredicate: (output: string) => boolean,
    timeoutMs = 60000
  ): Promise<void> {
    const { entryPoint, args, cwd } = this.options;
    this.child = spawn(process.execPath, [entryPoint, ...args], {
      cwd,
      env: process.env
    });

    const child = this.child;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Azurite process (${entryPoint}) did not become ready within ${timeoutMs}ms. Output so far:\n${this.output}`
          )
        );
      }, timeoutMs);

      const onData = (data: Buffer) => {
        this.output += data.toString();
        if (readyPredicate(this.output)) {
          cleanup();
          resolve();
        }
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onExit = (code: number | null) => {
        // Reached only if the process exits before the ready-predicate matched
        // (once matched, `cleanup()` removes this listener) - always an error,
        // even for a "clean" exit code of 0.
        cleanup();
        reject(
          new Error(
            `Azurite process (${entryPoint}) exited early with code ${code}. Output:\n${this.output}`
          )
        );
      };

      const cleanup = () => {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        child.off("error", onError);
        child.off("exit", onExit);
      };

      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("error", onError);
      child.on("exit", onExit);
    });
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.killed) {
      return;
    }
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }, 5000);
    });
  }
}

/** Builds a ready-predicate matching Azurite's standard startup log lines. */
export function allServicesReady(
  blobPort: number,
  queuePort: number,
  tablePort: number
): (output: string) => boolean {
  return (output: string) =>
    output.includes(
      `Azurite Blob service is successfully listening at http://127.0.0.1:${blobPort}`
    ) &&
    output.includes(
      `Azurite Queue service is successfully listening at http://127.0.0.1:${queuePort}`
    ) &&
    output.includes(
      `Azurite Table service is successfully listening at http://127.0.0.1:${tablePort}`
    );
}
