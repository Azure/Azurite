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
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms) as unknown as {
      unref?: () => void;
    };
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
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
    let startupTimeoutLogged = false;
    while (options.getStatus() === ServerStatus.Starting) {
      if (!startupTimeoutLogged && attempts >= maxAttempts) {
        startupTimeoutLogged = true;
        options.logger.error(
          `GC error occurred during server startup. Server did not transition to Running state ` +
            `within ~${waitIntervalMs * maxAttempts}ms. Current status: ${ServerStatus.Starting}. ` +
            `Will keep waiting and close if server reaches Running later.`
        );
      }

      await delay(waitIntervalMs);
      attempts++;
    }

    const status = options.getStatus();
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
