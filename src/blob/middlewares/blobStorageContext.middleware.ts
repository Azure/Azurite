import { NextFunction, Request, Response } from "express";
import uuid from "uuid/v4";

import logger from "../../common/Logger";
import { checkApiVersion } from "../../common/utils/utils";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { PRODUCTION_STYLE_URL_HOSTNAME } from "../../common/utils/constants";
import {
  DEFAULT_CONTEXT_PATH,
  HeaderConstants,
  SECONDARY_SUFFIX,
  ValidAPIVersions,
  VERSION
} from "../utils/constants";

/**
 * A middleware extract related blob service context.
 *
 * @export
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {NextFunction} next An express middleware next callback
 */
export default function blobStorageContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Set server header in every Azurite response
  res.setHeader(HeaderConstants.SERVER, `Azurite-Blob/${VERSION}`);
  const requestID = uuid();

  const apiVersion = req.header(HeaderConstants.X_MS_VERSION);
  if (apiVersion !== undefined) {
    checkApiVersion(apiVersion, ValidAPIVersions, requestID);
  }

  const blobContext = new BlobStorageContext(res.locals, DEFAULT_CONTEXT_PATH);
  blobContext.startTime = new Date();

  blobContext.xMsRequestID = requestID;

  logger.info(
    `BlobStorageContextMiddleware: RequestMethod=${req.method} RequestURL=${
      req.protocol
    }://${req.hostname}${req.url} RequestHeaders:${JSON.stringify(
      req.headers
    )} ClientIP=${req.ip} Protocol=${req.protocol} HTTPVersion=${
      req.httpVersion
    }`,
    requestID
  );

  const [account, container, blob, isSecondary] = extractStoragePartsFromPath(
    req.hostname,
    req.path
  );

  blobContext.account = account;
  blobContext.container = container;
  blobContext.blob = blob;
  blobContext.isSecondary = isSecondary;

  // Emulator's URL pattern is like http://hostname[:port]/account/container (or, alternatively, http[s]://account.localhost[:port]/container)
  // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
  // Exclude account name from req.path for dispatchMiddleware
  blobContext.dispatchPattern = container
    ? blob
      ? `/container/blob`
      : `/container`
    : "/";

  blobContext.authenticationPath = req.path;
  if (isSecondary) {
    const pos = blobContext.authenticationPath.search(SECONDARY_SUFFIX);
    blobContext.authenticationPath =
      blobContext.authenticationPath.substr(0, pos) +
      blobContext.authenticationPath.substr(pos + SECONDARY_SUFFIX.length);
  }

  if (!account) {
    const handlerError = StorageErrorFactory.getInvalidQueryParameterValue(
      requestID
    );

    logger.error(
      `BlobStorageContextMiddleware: BlobStorageContextMiddleware: ${handlerError.message}`,
      requestID
    );

    return next(handlerError);
  }

  logger.info(
    `BlobStorageContextMiddleware: Account=${account} Container=${container} Blob=${blob}`,
    requestID
  );
  next();
}

/**
 * Extract storage account, container, and blob from URL path.
 *
 * @param {string} path
 * @returns {([string | undefined, string | undefined, string | undefined, boolean | undefined])}
 */
export function extractStoragePartsFromPath(
  hostname: string,
  path: string
): [
  string | undefined,
  string | undefined,
  string | undefined,
  boolean | undefined
] {
  let account;
  let container;
  let blob;
  let isSecondary = false;

  const decodedPath = decodeURIComponent(path);
  const normalizedPath = decodedPath.startsWith("/")
    ? decodedPath.substr(1)
    : decodedPath; // Remove starting "/"

  const parts = normalizedPath.split("/");

  var urlPartIndex = 0;
  if (hostname.endsWith(PRODUCTION_STYLE_URL_HOSTNAME)) {
    account = hostname.substring(
      0,
      hostname.length - PRODUCTION_STYLE_URL_HOSTNAME.length
    );
  } else {
    account = parts[urlPartIndex++];
  }
  container = parts[urlPartIndex++];
  blob = parts
    .slice(urlPartIndex++)
    .join("/")
    .replace(/\\/g, "/"); // Azure Storage Server will replace "\" with "/" in the blob names

  if (account.endsWith(SECONDARY_SUFFIX)) {
    account = account.substr(0, account.length - SECONDARY_SUFFIX.length);
    isSecondary = true;
  }

  return [account, container, blob, isSecondary];
}
