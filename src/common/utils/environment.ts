import { OAuthLevel } from "../models";

export function parseOAuthLevel(value: unknown): OAuthLevel | undefined {
  if (value === undefined) {
    return;
  }

  if (
    typeof value === "string" &&
    Object.values(OAuthLevel).includes(value.toLowerCase() as OAuthLevel)
  ) {
    return value.toLowerCase() as OAuthLevel;
  }

  throw new RangeError(
    `Must provide a valid value for parameter --oauth. Supported values: ${Object.values(
      OAuthLevel
    ).join(", ")}.`
  );
}

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
