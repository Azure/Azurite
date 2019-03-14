import { NextFunction, Request, Response } from "express";

import logger from "../../common/Logger";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { DEFAULT_CONTEXT_PATH } from "../utils/constants";
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

  // TODO: Use GUID for a server request ID
  const requestID = blobContext.startTime.getTime().toString();
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

  const parts = extractStoragePartsFromPath(req.path);
  const account = parts[0];
  const container = parts[1];
  const blob = parts[2];

  blobContext.account = account;
  blobContext.container = container;
  blobContext.blob = blob;

  // Emulator's URL pattern is like http://hostname:port/account/container
  // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
  // Exclude account name from req.path for dispatchMiddleware
  blobContext.dispatchPath = container
    ? blob
      ? `/container/blob`
      : `/container`
    : "/";

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
 * @returns {([string | undefined, string | undefined, string | undefined])}
 */
function extractStoragePartsFromPath(
  path: string
): [string | undefined, string | undefined, string | undefined] {
  let account;
  let container;
  let blob;

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

  return [account, container, blob];
}
