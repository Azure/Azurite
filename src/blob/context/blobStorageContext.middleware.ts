import { NextFunction, Request, Response } from "express";
import uuid from "uuid/v4";

import logger from "../../common/Logger";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { DEFAULT_CONTEXT_PATH, SECONDARY_SUFFIX } from "../utils/constants";
import BlobStorageContext from "./BlobStorageContext";

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
  const blobContext = new BlobStorageContext(res.locals, DEFAULT_CONTEXT_PATH);
  blobContext.startTime = new Date();

  const requestID = uuid();
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
    req.path
  );

  blobContext.account = account;
  blobContext.container = container;
  blobContext.blob = blob;
  blobContext.isSecondary = isSecondary;

  // Emulator's URL pattern is like http://hostname:port/account/container
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
      `BlobStorageContextMiddleware: BlobStorageContextMiddleware: ${
        handlerError.message
      }`,
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

  account = parts[0];
  container = parts[1];
  blob = parts
    .slice(2)
    .join("/")
    .replace(/\\/g, "/"); // Azure Storage Server will replace "\" with "/" in the blob names

  if (account.endsWith(SECONDARY_SUFFIX)) {
    account = account.substr(0, account.length - SECONDARY_SUFFIX.length);
    isSecondary = true;
  }

  return [account, container, blob, isSecondary];
}
