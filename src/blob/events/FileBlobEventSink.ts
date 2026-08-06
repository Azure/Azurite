import { ensureDir } from "fs-extra";
import { writeFile } from "fs/promises";
import { join } from "path";

import ILogger from "../../common/ILogger";
import { IBlobEvent } from "./IBlobEvent";
import IBlobEventSink from "./IBlobEventSink";

/**
 * Writes each captured event to its own JSON file in a folder. Async and
 * fire-and-forget: write failures are logged, never surfaced to the caller.
 * If the folder cannot be created at init(), the sink permanently disables
 * itself so the server keeps running.
 */
export default class FileBlobEventSink implements IBlobEventSink {
  private enabled = true;
  private readonly pending = new Set<Promise<void>>();

  public constructor(
    private readonly folderPath: string,
    private readonly logger: ILogger
  ) {}

  public async init(): Promise<void> {
    try {
      await ensureDir(this.folderPath);
    } catch (err) {
      this.enabled = false;
      this.logger.error(
        `Blob event capture disabled: cannot create folder "${this.folderPath}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  public emit(event: IBlobEvent): void {
    if (!this.enabled) {
      return;
    }
    const fileName = `${event.eventTime.replace(/[:.]/g, "-")}-${event.id}.json`;
    const filePath = join(this.folderPath, fileName);
    const p = writeFile(filePath, JSON.stringify(event, null, 2))
      .catch((err) => {
        this.logger.warn(
          `Failed to write blob event file "${filePath}": ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      })
      .finally(() => {
        this.pending.delete(p);
      });
    this.pending.add(p);
  }

  public async close(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
