import { ensureDir } from "fs-extra";
import { writeFile } from "fs/promises";
import { join } from "path";

import ILogger from "../../common/ILogger";
import { IBlobEvent } from "./IBlobEvent";
import IBlobEventSink from "./IBlobEventSink";

/**
 * Replace any character that isn't alphanumeric or a hyphen. The filename is
 * built from event fields; sanitizing each segment guarantees a crafted value
 * cannot introduce path separators or ".." traversal that would escape the
 * capture folder, regardless of how the event was constructed.
 */
function sanitizeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9-]/g, "_");
}

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
    const safeTime = sanitizeSegment(event.eventTime.replace(/[:.]/g, "-"));
    const safeId = sanitizeSegment(event.id);
    const fileName = `${safeTime}-${safeId}.json`;
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
