import { NextFunction, Request, RequestHandler, Response } from "express";
import uuid from "uuid/v4";

import logger from "../../common/Logger";
import { PRODUCTION_STYLE_URL_HOSTNAME } from "../../common/utils/constants";
import TableStorageContext from "../context/TableStorageContext";
import {
  DEFAULT_TABLE_CONTEXT_PATH,
  HeaderConstants
} from "../utils/constants";

export default function createTableStorageContextMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return tableStorageContextMiddleware(req, res, next);
  };
}

/**
 * A middleware extract related table service context.
 *
 * @export
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {NextFunction} next An express middleware next callback
 */
export function tableStorageContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Set server header in every Azurite response
  res.setHeader(
    HeaderConstants.SERVER,
    `Azurite-table/${HeaderConstants.VERSION}`
  );

  const requestID = uuid();

  const tableContext = new TableStorageContext(
    res.locals,
    DEFAULT_TABLE_CONTEXT_PATH
  );

  tableContext.accept = req.headers.accept;
  tableContext.startTime = new Date();
  tableContext.xMsRequestID = requestID;

  logger.info(
    `TableStorageContextMiddleware: RequestMethod=${req.method} RequestURL=${
      req.protocol
    }://${req.hostname}${req.url} RequestHeaders:${JSON.stringify(
      req.headers
    )} ClientIP=${req.ip} Protocol=${req.protocol} HTTPVersion=${
      req.httpVersion
    }`,
    requestID
  );

  const [account, table] = extractStoragePartsFromPath(req.hostname, req.path);

  tableContext.account = account;
  tableContext.tableName = table;

  // Emulator's URL pattern is like http://hostname[:port]/account/table
  // (or, alternatively, http[s]://account.localhost[:port]/table/)
  // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
  // Exclude account name from req.path for dispatchMiddleware
  tableContext.dispatchPattern = table !== undefined ? `/Tables` : "/";

  logger.info(
    `tableStorageContextMiddleware: Account=${account} tableName=${table}}`,
    requestID
  );
  next();
}

/**
 * Extract storage account, table, and messages from URL path.
 *
 * @param {string} path
 * @returns {([string | undefined, string | undefined, string | undefined, boolean | undefined])}
 */
export function extractStoragePartsFromPath(
  hostname: string,
  path: string
): [string | undefined, string | undefined] {
  let account;
  let table;

  const decodedPath = decodeURIComponent(path);
  const normalizedPath = decodedPath.startsWith("/")
    ? decodedPath.substr(1)
    : decodedPath; // Remove starting "/"

  const parts = normalizedPath.split("/");

  let urlPartIndex = 0;
  if (hostname.endsWith(PRODUCTION_STYLE_URL_HOSTNAME)) {
    account = hostname.substring(
      0,
      hostname.length - PRODUCTION_STYLE_URL_HOSTNAME.length
    );
  } else {
    account = parts[urlPartIndex++];
  }
  table = parts[urlPartIndex++];

  return [account, table];
}
