import { NextFunction, Request, RequestHandler, Response } from "express";
import uuid from "uuid/v4";

import logger from "../../common/Logger";
import { IP_REGEX } from "../../common/utils/constants";
import { NO_ACCOUNT_HOST_NAMES } from "../../common/utils/constants";
import QueueStorageContext from "../context/QueueStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  DEFAULT_QUEUE_CONTEXT_PATH,
  HeaderConstants,
  SECONDARY_SUFFIX,
  ValidAPIVersions,
  VERSION
} from "../utils/constants";
import { checkApiVersion, isValidName, nameValidateCode } from "../utils/utils";

export default function createQueueStorageContextMiddleware(
  skipApiVersionCheck?: boolean,
  disableProductStyleUrl?: boolean
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return queueStorageContextMiddleware(req, res, next, skipApiVersionCheck, disableProductStyleUrl);
  };
}

/**
 * A middleware extract related queue service context.
 *
 * @export
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {NextFunction} next An express middleware next callback
 */
export function queueStorageContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
  skipApiVersionCheck?: boolean,
  disableProductStyleUrl?: boolean
): void {
  // Set server header in every Azurite response
  res.setHeader(HeaderConstants.SERVER, `Azurite-Queue/${VERSION}`);

  const requestID = uuid();

  if (!skipApiVersionCheck) {
    const apiVersion = req.header(HeaderConstants.X_MS_VERSION);
    if (apiVersion !== undefined) {
      checkApiVersion(apiVersion, ValidAPIVersions, requestID);
    }
  }

  const queueContext = new QueueStorageContext(
    res.locals,
    DEFAULT_QUEUE_CONTEXT_PATH
  );
  queueContext.startTime = new Date();

  queueContext.xMsRequestID = requestID;

  logger.info(
    `QueueStorageContextMiddleware: RequestMethod=${req.method} RequestURL=${
      req.protocol
    }://${req.hostname}${req.url} RequestHeaders:${JSON.stringify(
      req.headers
    )} ClientIP=${req.ip} Protocol=${req.protocol} HTTPVersion=${
      req.httpVersion
    }`,
    requestID
  );

  const [
    account,
    queue,
    message,
    messageId,
    isSecondary
  ] = extractStoragePartsFromPath(req.hostname, req.path, disableProductStyleUrl);

  queueContext.account = account;
  queueContext.queue = queue;
  queueContext.message = message;
  queueContext.messageId = messageId;
  queueContext.isSecondary = isSecondary;

  // Emulator's URL pattern is like http://hostname[:port]/account/queue/messages
  // (or, alternatively, http[s]://account.localhost[:port]/queue/messages)
  // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
  // Exclude account name from req.path for dispatchMiddleware
  queueContext.dispatchPattern =
    queue !== undefined
      ? message !== undefined
        ? messageId !== undefined
          ? `/queue/messages/messageId`
          : `/queue/messages`
        : `/queue`
      : "/";

  // The value of queue may be "" in some cases, e.g. list queue with .../accountname/?comp=list...
  if (
    req.query &&
    (req.query.restype === "service" || req.query.comp === "list")
  ) {
    queueContext.dispatchPattern = "/";
  }

  queueContext.authenticationPath = req.path;
  if (isSecondary) {
    const pos = queueContext.authenticationPath.search(SECONDARY_SUFFIX);
    if (pos !== -1)
    {
      queueContext.authenticationPath =
      queueContext.authenticationPath.substr(0, pos) +
      queueContext.authenticationPath.substr(pos + SECONDARY_SUFFIX.length);
    }
  }

  if (account === undefined) {
    const handlerError = StorageErrorFactory.getInvalidQueryParameterValue(
      requestID
    );

    logger.error(
      `QueueStorageContextMiddleware: QueueStorageContextMiddleware: ${handlerError.message}`,
      requestID
    );

    return next(handlerError);
  }

  // If it is not and account operations, then the queue name should be validated.
  if (queueContext.dispatchPattern !== "/" && queue !== undefined) {
    const nameValidateStatus = isValidName(queue);

    if (nameValidateStatus === nameValidateCode.invalidUri) {
      const handlerError = StorageErrorFactory.getInvalidUri(requestID, {
        UriPath: `/${queue}`
      });
      return next(handlerError);
    }

    if (nameValidateStatus === nameValidateCode.outOfRange) {
      const handlerError = StorageErrorFactory.getOutOfRangeName(requestID);
      return next(handlerError);
    }

    if (nameValidateStatus === nameValidateCode.invalidName) {
      const handlerError = StorageErrorFactory.getInvalidResourceName(
        requestID
      );
      return next(handlerError);
    }
  }

  logger.info(
    `QueueStorageContextMiddleware: Account=${account} Queue=${queue} Message=${message} MessageId=${messageId}`,
    requestID
  );
  next();
}

/**
 * Extract storage account, queue, and massages from URL path.
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
  let queue;
  let message;
  let messageId;
  let isSecondary = false;

  const decodedPath = decodeURIComponent(path);
  const normalizedPath = decodedPath.startsWith("/")
    ? decodedPath.substr(1)
    : decodedPath; // Remove starting "/"

  const parts = normalizedPath.split("/");

  let urlPartIndex = 0;
  const isIPAddress = IP_REGEX.test(hostname);
  const isNoAccountHostName = NO_ACCOUNT_HOST_NAMES.has(hostname.toLowerCase());
  const firstDotIndex = hostname.indexOf(".");
  // If hostname is not an IP address or a known host name, and has a dot inside,
  // we assume user wants to access emulator with a production-like URL.
  if (!disableProductStyleUrl && !isIPAddress && !isNoAccountHostName && firstDotIndex > 0) {
    account = hostname.substring(
      0,
      firstDotIndex
    );
  } else {
    account = parts[urlPartIndex++];
  }
  queue = parts[urlPartIndex++];
  // For delete and update, it is messages/messageid?popreceipt=string-value
  message = parts[urlPartIndex++];
  messageId = parts[urlPartIndex++];

  if (account.endsWith(SECONDARY_SUFFIX)) {
    account = account.substr(0, account.length - SECONDARY_SUFFIX.length);
    isSecondary = true;
  }

  return [account, queue, message, messageId, isSecondary];
}
