import { isAbsolute, join } from "path";

import { DEFAULT_BLOB_EVENT_CAPTURE_PATH } from "../utils/constants";

/**
 * Resolve the effective folder that blob event capture writes to. Shared by
 * both server entry points (the CLI `BlobServerFactory` and the VS Code
 * `VSCServerManagerBlob`) so the two behave identically.
 *
 * Returns "" when capture is disabled — callers treat an empty path as
 * "no sink". When enabled: an absolute configured path is used verbatim; a
 * relative configured path resolves against `location`; an empty/omitted
 * configured path falls back to the default folder under `location`.
 */
export function resolveBlobEventCapturePath(
  enableCapture: boolean,
  configuredPath: string | undefined,
  location: string
): string {
  if (!enableCapture) {
    return "";
  }
  if (configuredPath !== undefined && configuredPath.length > 0) {
    return isAbsolute(configuredPath)
      ? configuredPath
      : join(location, configuredPath);
  }
  return join(location, DEFAULT_BLOB_EVENT_CAPTURE_PATH);
}
