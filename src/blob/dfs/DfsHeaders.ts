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

/**
 * The parts of an x-ms-rename-source header.
 */
export interface IRenameSource {
  filesystem: string;
  path: string;
  /** Query parameters of the source, e.g. a SAS authorizing it */
  query: URLSearchParams;
}

/**
 * Parse an x-ms-rename-source header: "/{filesystem}/{path}[?query]", where
 * the filesystem may be preceded by the account for path-style requests
 * ("/{account}/{filesystem}/{path}"). The segments are decoded one by one
 * without URL normalization, so "." and ".." segments are rejected rather
 * than resolved.
 *
 * @param {string} header The header value.
 * @param {string} account The account of the request.
 * @param {boolean} isPathStyle Whether the request URL names the account in its path.
 * @returns {(IRenameSource | string)} The parsed source, or an error message.
 */
export function parseRenameSource(
  header: string,
  account: string,
  isPathStyle: boolean
): IRenameSource | string {
  const queryIndex = header.indexOf("?");
  const rawPath = queryIndex >= 0 ? header.substring(0, queryIndex) : header;
  const query = new URLSearchParams(queryIndex >= 0 ? header.substring(queryIndex + 1) : "");

  let parts: string[];
  try {
    parts = rawPath.split("/").filter(part => part !== "").map(decodeURIComponent);
  } catch {
    return `Invalid percent-encoding in rename source: ${header}`;
  }
  if (parts.some(part => part === "." || part === "..")) {
    return "Rename source path must not contain '.' or '..' segments.";
  }

  if (isPathStyle && parts.length >= 3 && parts[0] === account) {
    parts = parts.slice(1);
  }
  if (parts.length < 2) {
    return `Invalid rename source: ${header}`;
  }
  return { filesystem: parts[0], path: parts.slice(1).join("/"), query };
}

/**
 * Whether the URL of a DFS request names the account in its path (e.g.
 * http://127.0.0.1:10000/devstoreaccount1/fs/path) rather than in its host
 * name. With such URLs, the DataLake SDKs may also name the account in the
 * x-ms-rename-source header.
 */
export function isPathStyleRequest(
  ctx: { isPathStyle?: boolean },
  _account?: string
): boolean {
  return ctx.isPathStyle === true;
}
