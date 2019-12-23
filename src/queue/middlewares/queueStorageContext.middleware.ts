import { NextFunction, Request, Response } from "express";
import uuid from "uuid/v4";

import logger from "../../common/Logger";
import { checkApiVersion } from "../../common/utils/utils";
import QueueStorageContext from "../context/QueueStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  DEFAULT_QUEUE_CONTEXT_PATH,
  HeaderConstants,
  SECONDARY_SUFFIX,
  ValidAPIVersions,
  VERSION
} from "../utils/constants";
import { isValidName, nameValidateCode } from "../utils/utils";

/**
 * A middleware extract related queue service context.
 *
 * @export
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {NextFunction} next An express middleware next callback
 */
export default function queueStorageContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Set server header in every Azurite response
  res.setHeader(HeaderConstants.SERVER, `Azurite-Queue/${VERSION}`);

  const requestID = uuid();

  const apiVersion = req.header(HeaderConstants.X_MS_VERSION);
  if (apiVersion !== undefined) {
    checkApiVersion(apiVersion, ValidAPIVersions, requestID);
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
  ] = extractStoragePartsFromPath(req.path);

  queueContext.account = account;
  queueContext.queue = queue;
  queueContext.message = message;
  queueContext.messageId = messageId;
  queueContext.isSecondary = isSecondary;

  // Emulator's URL pattern is like http://hostname:port/account/queue/messages
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
    queueContext.authenticationPath =
      queueContext.authenticationPath.substr(0, pos) +
      queueContext.authenticationPath.substr(pos + SECONDARY_SUFFIX.length);
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
  path: string
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

  account = parts[0];
  queue = parts[1];
  // For delete and update, it is messages/messageid?popreceipt=string-value
  message = parts[2];
  messageId = parts[3];

  if (account.endsWith(SECONDARY_SUFFIX)) {
    account = account.substr(0, account.length - SECONDARY_SUFFIX.length);
    isSecondary = true;
  }

  return [account, queue, message, messageId, isSecondary];
}
