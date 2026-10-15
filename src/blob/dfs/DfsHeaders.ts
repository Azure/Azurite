/**
 * Parse an x-ms-properties header: a comma-separated list of "name=value"
 * pairs, where each value is base64 encoded.
 *
 * @param {string} [header] The header value.
 * @returns {{ [key: string]: string }} The decoded properties.
 */
export function parseDfsProperties(header?: string): { [key: string]: string } {
  const properties: { [key: string]: string } = {};
  if (!header) {
    return properties;
  }

  for (const pair of header.split(",")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx >= 0) {
      properties[pair.substring(0, eqIdx)] = Buffer.from(
        pair.substring(eqIdx + 1),
        "base64"
      ).toString("utf8");
    }
  }
  return properties;
}
