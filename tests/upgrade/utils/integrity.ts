import { createHash } from "crypto";

/** Convenience helper used across the upgrade suite for content-hash comparisons. */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Throws a descriptive error unless `actual` and `expected` are byte-for-byte
 * identical (same length and same SHA-256 digest).
 */
export function assertByteIdentical(
  actual: Buffer,
  expected: Buffer,
  label: string
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      `${label}: length mismatch (expected ${expected.length} bytes, got ${actual.length} bytes)`
    );
  }
  const actualHash = sha256(actual);
  const expectedHash = sha256(expected);
  if (actualHash !== expectedHash) {
    throw new Error(
      `${label}: content hash mismatch (expected ${expectedHash}, got ${actualHash})`
    );
  }
}

/**
 * Deep-compares two plain value maps (e.g. table entity properties or queue
 * message metadata), producing a readable error listing every mismatch
 * instead of failing on the first one.
 */
export function assertValuesEqual(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  label: string
): void {
  const mismatches: string[] = [];
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);

  for (const key of keys) {
    const a = actual[key];
    const e = expected[key];
    const normalizedA = a instanceof Uint8Array ? Buffer.from(a).toString("base64") : a;
    const normalizedE = e instanceof Uint8Array ? Buffer.from(e).toString("base64") : e;

    if (JSON.stringify(normalizedA) !== JSON.stringify(normalizedE)) {
      mismatches.push(`  ${key}: expected ${JSON.stringify(normalizedE)}, got ${JSON.stringify(normalizedA)}`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`${label}: property mismatches:\n${mismatches.join("\n")}`);
  }
}
