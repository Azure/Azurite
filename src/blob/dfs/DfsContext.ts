import { randomUUID as uuid } from "crypto";
import { NextFunction, Request, RequestHandler, Response } from "express";

import logger from "../../common/Logger";
import { IP_REGEX, NO_ACCOUNT_HOST_NAMES } from "../../common/utils/constants";
import { SECONDARY_SUFFIX, HeaderConstants, ValidAPIVersions, VERSION } from "../utils/constants";
import { checkApiVersion } from "../utils/utils";
import { DfsOperation } from "./DfsOperation";
import { sendDfsError } from "./DfsErrorFactory";

/**
 * Identity extracted from an OAuth bearer token.
 * Used for ACL enforcement in Phase III (--oauth acl).
 */
export interface IDfsAuthenticatedIdentity {
  /** Azure AD object ID (oid claim) */
  oid?: string;
  /** User principal name (upn claim) */
  upn?: string;
  /** Tenant ID (tid claim) */
  tid?: string;
  /** Application ID (appid claim) */
  appid?: string;
}

export interface IDfsContext {
  requestId: string;
  startTime: Date;
  account?: string;
  filesystem?: string;
  path?: string;
  isSecondary?: boolean;
  operation?: DfsOperation;
  authenticationPath?: string;
  /**
   * Whether the account is named by the request path (IP-style URL, plain
   * host name or --disableProductStyleUrl) rather than by the host name.
   */
  isPathStyle?: boolean;
  /** Authenticated identity from OAuth token — populated when --oauth acl is enabled */
  identity?: IDfsAuthenticatedIdentity;
}

const DFS_CONTEXT_KEY = "dfsContext";

export function getDfsContext(res: Response): IDfsContext {
  return res.locals[DFS_CONTEXT_KEY];
}

export default function createDfsContextMiddleware(
  skipApiVersionCheck?: boolean,
  disableProductStyleUrl?: boolean
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader(HeaderConstants.SERVER, `Azurite-DFS/${VERSION}`);
    const requestId = uuid();

    if (!skipApiVersionCheck) {
      const apiVersion = req.header(HeaderConstants.X_MS_VERSION);
      if (apiVersion !== undefined) {
        try {
          checkApiVersion(apiVersion, ValidAPIVersions, requestId);
        } catch (error) {
          next(error);
          return;
        }
      }
    }

    const context: IDfsContext = {
      requestId,
      startTime: new Date()
    };

    const renameSource = req.headers["x-ms-rename-source"] as string | undefined;
    let account: string | undefined;
    let filesystem: string | undefined;
    let path: string | undefined;
    let isSecondary: boolean;
    try {
      [account, filesystem, path, isSecondary] = extractDfsPartsFromPath(
        req.hostname,
        req.path,
        disableProductStyleUrl,
        renameSource
      );
    } catch (error: any) {
      // e.g. a malformed percent-encoding (decodeURIComponent throws URIError)
      sendDfsError(res, {
        statusCode: 400,
        code: "InvalidUri",
        message: `The requested URI does not represent any resource on the server. RequestUri: ${req.originalUrl}`
      });
      return;
    }

    context.account = account;
    context.filesystem = filesystem;
    context.path = path;
    context.isSecondary = isSecondary;
    context.authenticationPath = req.path;
    context.isPathStyle = isPathStyleHostname(req.hostname, disableProductStyleUrl);

    if (isSecondary && context.authenticationPath) {
      const pos = context.authenticationPath.search(SECONDARY_SUFFIX);
      if (pos !== -1) {
        context.authenticationPath =
          context.authenticationPath.substr(0, pos) +
          context.authenticationPath.substr(pos + SECONDARY_SUFFIX.length);
      }
    }

    res.locals[DFS_CONTEXT_KEY] = context;

    logger.info(
      `DfsContextMiddleware: RequestMethod=${req.method} RequestURL=${req.protocol}://${req.hostname}${redactSignature(req.url)} ClientIP=${req.ip}`,
      requestId
    );
    logger.info(
      `DfsContextMiddleware: Account=${account} Filesystem=${filesystem} Path=${path}`,
      requestId
    );

    if (!account) {
      sendDfsError(res, { statusCode: 400, code: "InvalidQueryParameterValue", message: "Account name is required." });
      return;
    }

    next();
  };
}

/**
 * A request URL whose SAS signature (sig) is redacted, for logs.
 */
export function redactSignature(url: string): string {
  return url.replace(/([?&]sig=)[^&]*/gi, "$1REDACTED");
}

/**
 * Whether a request with this host name names its account in its path rather
 * than in its host name.
 */
function isPathStyleHostname(hostname: string, disableProductStyleUrl?: boolean): boolean {
  return disableProductStyleUrl === true ||
    IP_REGEX.test(hostname) ||
    NO_ACCOUNT_HOST_NAMES.has(hostname.toLowerCase()) ||
    hostname.indexOf(".") <= 0;
}

/**
 * The account named by an x-ms-rename-source header ("/<account>/<filesystem>/<path>")
 * when the destination path omits it, i.e. when the first segment of the
 * source isn't the first segment of the destination.
 */
function renameSourceAccount(renameSource: string, destinationFirstSegment: string | undefined): string | undefined {
  const queryIndex = renameSource.indexOf("?");
  const segments = (queryIndex >= 0 ? renameSource.substring(0, queryIndex) : renameSource)
    .split("/")
    .filter(segment => segment !== "");
  let first: string;
  try {
    first = decodeURIComponent(segments[0] ?? "");
  } catch {
    return undefined;
  }
  return segments.length >= 3 && first !== destinationFirstSegment ? first : undefined;
}

function extractDfsPartsFromPath(
  hostname: string,
  path: string,
  disableProductStyleUrl?: boolean,
  renameSource?: string
): [string | undefined, string | undefined, string | undefined, boolean] {
  let account: string | undefined;
  let filesystem: string | undefined;
  let blobPath: string | undefined;
  let isSecondary = false;

  const decodedPath = decodeURIComponent(path);
  const normalizedPath = decodedPath.startsWith("/")
    ? decodedPath.substr(1)
    : decodedPath;

  const parts = normalizedPath.split("/");
  let urlPartIndex = 0;

  const isIPAddress = IP_REGEX.test(hostname);
  const isNoAccountHostName = NO_ACCOUNT_HOST_NAMES.has(hostname.toLowerCase());
  const firstDotIndex = hostname.indexOf(".");

  if (!disableProductStyleUrl && !isIPAddress && !isNoAccountHostName && firstDotIndex > 0) {
    account = hostname.substring(0, firstDotIndex);
  } else {
    account = parts[urlPartIndex++];
    // The DataLake SDK constructs destination URLs for move() as /<filesystem>/<path>,
    // omitting the account name when the base URL is IP-based, while its
    // x-ms-rename-source names /<account>/<filesystem>/<path>. Detect this ONLY
    // for rename requests: when the first segments of the destination and the
    // source differ, the source names the account and the destination omits it.
    const sourceAccount = renameSource !== undefined && (isIPAddress || isNoAccountHostName)
      ? renameSourceAccount(renameSource, account)
      : undefined;
    if (sourceAccount !== undefined) {
      // Treat the first segment as the filesystem, not the account
      filesystem = account;
      account = sourceAccount;
      blobPath = parts.slice(urlPartIndex).join("/").replace(/\\/g, "/");
      return [account, filesystem, blobPath || undefined, isSecondary];
    }
  }

  filesystem = parts[urlPartIndex++];
  blobPath = parts
    .slice(urlPartIndex)
    .join("/")
    .replace(/\\/g, "/");

  if (account && account.endsWith(SECONDARY_SUFFIX)) {
    account = account.substr(0, account.length - SECONDARY_SUFFIX.length);
    isSecondary = true;
  }

  // Empty strings become undefined
  if (!filesystem) filesystem = undefined;
  if (!blobPath) blobPath = undefined;

  return [account, filesystem, blobPath, isSecondary];
}
