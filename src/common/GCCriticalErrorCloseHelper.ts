import ILogger from "./ILogger";
import { ServerStatus } from "./ServerBase";

export interface GCCriticalErrorCloseHelperOptions {
  readonly serviceName: string;
  readonly getStatus: () => ServerStatus;
  readonly close: () => Promise<void>;
  readonly logger: ILogger;
  readonly waitIntervalMs?: number;
  readonly maxAttempts?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handles the startup/close race when a critical GC error occurs while a server is still Starting.
 */
export async function handleGCCriticalErrorClose(
  options: GCCriticalErrorCloseHelperOptions
): Promise<void> {
  const waitIntervalMs = options.waitIntervalMs ?? 100;
  const maxAttempts = options.maxAttempts ?? 50;

  try {
    let attempts = 0;
    const startTime = Date.now();
    while (
      options.getStatus() === ServerStatus.Starting &&
      attempts < maxAttempts
    ) {
      await delay(waitIntervalMs);
      attempts++;
    }

    const elapsedMs = Date.now() - startTime;
    const status = options.getStatus();
    if (status === ServerStatus.Starting) {
      options.logger.error(
        `GC error occurred during server startup. Server did not transition to Running state ` +
          `within ${elapsedMs}ms. Current status: ${status}. ` +
          `Server will continue operating with potentially limited functionality.`
      );
    }

    if (status === ServerStatus.Running) {
      options.logger.info(
        `Shutting down ${options.serviceName} server due to GC critical error`
      );
      await options.close();
      return;
    }

    options.logger.warn(
      `${options.serviceName} server status is ${status} (expected Running). ` +
        `Server state may be inconsistent. Check logs for root cause.`
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    options.logger.error(
      `${options.serviceName} server error during GC error handling: ${errorMsg}. ` +
        `Server status: ${options.getStatus()}`
    );
  }
}
