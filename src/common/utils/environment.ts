/**
 * Determines whether API version checks should be skipped.
 *
 * The CLI flag takes precedence. Otherwise, only the exact, case-sensitive
 * environment value "true" enables skipping.
 */
export function shouldSkipApiVersionCheck(flags?: {
  skipApiVersionCheck?: unknown;
}): boolean {
  return (
    flags?.skipApiVersionCheck !== undefined ||
    process.env.AZURITE_SKIP_API_VERSION_CHECK === "true"
  );
}
