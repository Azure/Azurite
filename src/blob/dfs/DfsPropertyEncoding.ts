/**
 * DFS uses x-ms-properties header with base64-encoded key=value pairs.
 * Format: "key1=base64(value1),key2=base64(value2)"
 */

export function encodeProperties(metadata: { [key: string]: string }): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}=${Buffer.from(value).toString("base64")}`)
    .join(",");
}

export function decodeProperties(encoded: string): { [key: string]: string } {
  const result: { [key: string]: string } = {};
  if (!encoded) return result;

  const pairs = encoded.split(",");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx >= 0) {
      const key = pair.substring(0, eqIdx);
      const value = Buffer.from(pair.substring(eqIdx + 1), "base64").toString("utf8");
      result[key] = value;
    }
  }
  return result;
}
