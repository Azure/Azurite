import { NextFunction, Request, RequestHandler, Response } from "express";
import uuid from "uuid/v4";

import logger from "../../common/Logger";
import { IP_REGEX } from "../../common/utils/constants";
import { NO_ACCOUNT_HOST_NAMES } from "../../common/utils/constants";
import DataLakeContext from "../context/DataLakeContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  HeaderConstants,
  SECONDARY_SUFFIX,
  ValidAPIVersions,
  VERSION
} from "../utils/constants";
import { checkApiVersion, validateContainerName } from "../utils/utils";
import { DEFAULT_CONTEXT_PATH } from "../../blob/utils/constants";
import IResponse from "../../blob/generated/IResponse";
import IRequest from "../../blob/generated/IRequest";

export default function createStorageBlobContextMiddleware(
  skipApiVersionCheck?: boolean,
  disableProductStyleUrl?: boolean,
  loose?: boolean
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return blobStorageContextMiddleware(
      req,
      res,
      next,
      skipApiVersionCheck,
      disableProductStyleUrl,
      loose
    );
  };
}

/**
 * A middleware extract related blob service context.
 *
 * @export
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {NextFunction} next An express middleware next callback
 */
export function internnalBlobStorageContextMiddleware(
  blobContext: DataLakeContext,
  req: IRequest,
  res: IResponse,
  reqHost: string,
  reqPath: string,
  next: NextFunction,
  skipApiVersionCheck?: boolean,
  disableProductStyleUrl?: boolean,
  loose?: boolean
): void {
  // Set server header in every Azurite response
  res.setHeader(HeaderConstants.SERVER, `Azurite-DataLake/${VERSION}`);
  const requestID = uuid();

  if (!skipApiVersionCheck) {
    const apiVersion = req.getHeader(HeaderConstants.X_MS_VERSION);
    if (apiVersion !== undefined) {
      checkApiVersion(apiVersion, ValidAPIVersions, blobContext);
    }
  }

  blobContext.startTime = new Date();
  blobContext.disableProductStyleUrl = disableProductStyleUrl;
  blobContext.loose = loose;

  blobContext.xMsRequestID = requestID;

  logger.info(
    `BlobStorageContextMiddleware: RequestMethod=${req.getMethod()} RequestURL=${req.getUrl()} RequestHeaders:${JSON.stringify(
      req.getHeaders()
    )} ClientIP=${req.getEndpoint()} Protocol=${req.getProtocol()} HTTPVersion=version`,
    requestID
  );

  const [account, container, blob, originalBlob, isSecondary] =
    extractStoragePartsFromPath(reqHost, reqPath, disableProductStyleUrl);

  blobContext.account = account;
  blobContext.container = container;
  blobContext.blob = blob;
  blobContext.originalBlob = originalBlob;
  blobContext.isSecondary = isSecondary;

  // Emulator's URL pattern is like http://hostname[:port]/account/container
  // (or, alternatively, http[s]://account.localhost[:port]/container)
  // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
  // Exclude account name from req.path for dispatchMiddleware
  blobContext.dispatchPattern = container
    ? blob
      ? `/container/blob`
      : `/container`
    : "/";

  blobContext.authenticationPath = reqPath;
  if (isSecondary) {
    const pos = blobContext.authenticationPath!.search(SECONDARY_SUFFIX);
    blobContext.authenticationPath =
      blobContext.authenticationPath!.substr(0, pos) +
      blobContext.authenticationPath!.substr(pos + SECONDARY_SUFFIX.length);
  }

  if (!account) {
    const handlerError =
      StorageErrorFactory.getInvalidQueryParameterValue(blobContext);

    logger.error(
      `BlobStorageContextMiddleware: BlobStorageContextMiddleware: ${handlerError.message}`,
      requestID
    );

    return next(handlerError);
  }

  // validate conatainer name, when container name has value (not undefined or empty string)
  // skip validate system container
  if (container && !container.startsWith("$")) {
    validateContainerName(blobContext, container);
  }

  logger.info(
    `BlobStorageContextMiddleware: Account=${account} Container=${container} Blob=${blob}`,
    requestID
  );
  next();
}

/**
 * A middleware extract related blob service context.
 *
 * @export
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {NextFunction} next An express middleware next callback
 */
export function blobStorageContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
  skipApiVersionCheck?: boolean,
  disableProductStyleUrl?: boolean,
  loose?: boolean
): void {
  // Set server header in every Azurite response
  res.setHeader(HeaderConstants.SERVER, `Azurite-DataLake/${VERSION}`);
  const requestID = uuid();
  const blobContext = new DataLakeContext(res.locals, DEFAULT_CONTEXT_PATH);
  blobContext.startTime = new Date();
  blobContext.disableProductStyleUrl = disableProductStyleUrl;
  blobContext.loose = loose;
  blobContext.xMsRequestID = requestID;

  if (!skipApiVersionCheck) {
    const apiVersion = req.header(HeaderConstants.X_MS_VERSION);
    if (apiVersion !== undefined) {
      checkApiVersion(apiVersion, ValidAPIVersions, blobContext);
    }
  }

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

  const [account, container, blob, originalBlob, isSecondary] =
    extractStoragePartsFromPath(req.hostname, req.path, disableProductStyleUrl);

  blobContext.account = account;
  blobContext.container = container;
  blobContext.blob = blob;
  blobContext.originalBlob = originalBlob;
  blobContext.isSecondary = isSecondary;

  // Emulator's URL pattern is like http://hostname[:port]/account/container
  // (or, alternatively, http[s]://account.localhost[:port]/container)
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
    const handlerError =
      StorageErrorFactory.getInvalidQueryParameterValue(blobContext);

    logger.error(
      `BlobStorageContextMiddleware: BlobStorageContextMiddleware: ${handlerError.message}`,
      requestID
    );

    return next(handlerError);
  }

  // validate conatainer name, when container name has value (not undefined or empty string)
  // skip validate system container
  if (container && !container.startsWith("$")) {
    validateContainerName(blobContext, container);
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
  path: string,
  disableProductStyleUrl?: boolean
): [
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  boolean | undefined
] {
  let account;
  let container;
  let blob;
  let isSecondary = false;

  const normalizedPath = path.startsWith("/") ? path.substring(1) : path; // Remove starting "/"

  const parts = normalizedPath.split("/");

  let urlPartIndex = 0;
  const isIPAddress = IP_REGEX.test(hostname);
  const isNoAccountHostName = NO_ACCOUNT_HOST_NAMES.has(hostname.toLowerCase());
  const firstDotIndex = hostname.indexOf(".");
  // If hostname is not an IP address or a known host name, and has a dot inside,
  // we assume user wants to access emulator with a production-like URL.
  if (
    !disableProductStyleUrl &&
    !isIPAddress &&
    !isNoAccountHostName &&
    firstDotIndex > 0
  ) {
    account = hostname.substring(0, firstDotIndex);
  } else {
    account = parts[urlPartIndex++];
  }
  container = parts[urlPartIndex++];
  if (container === account) container = parts[urlPartIndex++];
  const originalBlob = parts.slice(urlPartIndex++).join("/");
  blob = decodeURIComponent(originalBlob).replace(/\\/g, "/"); // Azure Storage Server will replace "\" with "/" in the blob names

  if (account.endsWith(SECONDARY_SUFFIX)) {
    account = account.substring(0, account.length - SECONDARY_SUFFIX.length);
    isSecondary = true;
  }

  if (account !== undefined) account = decodeURIComponent(account);
  if (container !== undefined) container = decodeURIComponent(container);
  return [account, container, blob, originalBlob, isSecondary];
}
