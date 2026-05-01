import uuid from "uuid/v4";
import { NextFunction, Request, RequestHandler, Response } from "express";

import logger from "../../common/Logger";
import { IP_REGEX, NO_ACCOUNT_HOST_NAMES } from "../../common/utils/constants";
import { SECONDARY_SUFFIX, HeaderConstants, ValidAPIVersions, VERSION, EMULATOR_ACCOUNT_NAME } from "../utils/constants";
import { checkApiVersion } from "../utils/utils";
import { DfsOperation } from "./DfsOperation";

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
        checkApiVersion(apiVersion, ValidAPIVersions, requestId);
      }
    }

    const context: IDfsContext = {
      requestId,
      startTime: new Date()
    };

    const [account, filesystem, path, isSecondary] = extractDfsPartsFromPath(
      req.hostname,
      req.path,
      disableProductStyleUrl
    );

    context.account = account;
    context.filesystem = filesystem;
    context.path = path;
    context.isSecondary = isSecondary;
    context.authenticationPath = req.path;

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
      `DfsContextMiddleware: RequestMethod=${req.method} RequestURL=${req.protocol}://${req.hostname}${req.url} ClientIP=${req.ip}`,
      requestId
    );
    logger.info(
      `DfsContextMiddleware: Account=${account} Filesystem=${filesystem} Path=${path}`,
      requestId
    );

    if (!account) {
      return res.status(400).json({
        error: { code: "InvalidQueryParameterValue", message: "Account name is required." }
      });
    }

    next();
  };
}

function extractDfsPartsFromPath(
  hostname: string,
  path: string,
  disableProductStyleUrl?: boolean
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
    // omitting the account name when the base URL is IP-based. Detect this by checking
    // whether the first segment is the emulator account; if not, fall back to it.
    if ((isIPAddress || isNoAccountHostName) && account && account !== EMULATOR_ACCOUNT_NAME) {
      // Treat the first segment as the filesystem, not the account
      filesystem = account;
      account = EMULATOR_ACCOUNT_NAME;
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
