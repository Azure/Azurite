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
    `Azurite-Table/${HeaderConstants.VERSION}`
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

  const [account, tableSection] = extractStoragePartsFromPath(
    req.hostname,
    req.path
  );

  // Candidate tableSection
  // undefined - Set Table Service Properties
  // Tables - Create Tables, Query Tables
  // Tables('mytable')	- Delete Tables
  // mytable - Get/Set Table ACL, Insert Entity
  // mytable(PartitionKey='<partition-key>',RowKey='<row-key>') -
  //        Query Entities, Update Entity, Merge Entity, Delete Entity
  // mytable() - Query Entities
  // TODO: Not allowed create Table with Tables as name
  if (tableSection === undefined) {
    // Service level operation
    tableContext.tableName = undefined;
  } else if (tableSection === "Tables") {
    // Table name in request body
    tableContext.tableName = undefined;
  } else if (
    tableSection.startsWith("Tables('") &&
    tableSection.endsWith("')")
  ) {
    // Tables('mytable')
    tableContext.tableName = tableSection.substring(8, tableSection.length - 2);
  } else if (!tableSection.includes("(") && !tableSection.includes(")")) {
    // mytable
    tableContext.tableName = tableSection;
  } else if (
    tableSection.includes("(") &&
    tableSection.includes(")") &&
    tableSection.includes("PartitionKey='") &&
    tableSection.includes("RowKey='")
  ) {
    // mytable(PartitionKey='<partition-key>',RowKey='<row-key>')
    tableContext.tableName = tableSection.substring(
      0,
      tableSection.indexOf("(")
    );
    const firstQuoteIndex = tableSection.indexOf("'");
    const secondQuoteIndex = tableSection.indexOf("'", firstQuoteIndex + 1);
    const thridQuoteIndex = tableSection.indexOf("'", secondQuoteIndex + 1);
    const fourthQuoteIndex = tableSection.indexOf("'", thridQuoteIndex + 1);
    tableContext.partitionKey = tableSection.substring(
      firstQuoteIndex + 1,
      secondQuoteIndex
    );
    tableContext.rowKey = tableSection.substring(
      thridQuoteIndex + 1,
      fourthQuoteIndex
    );
  } else {
    logger.error(
      `tableStorageContextMiddleware: Cannot extract table name from URL path=${req.path}`,
      requestID
    );
    return next(
      new Error(
        `tableStorageContextMiddleware: Cannot extract table name from URL path=${req.path}`
      )
    );
  }

  tableContext.account = account;

  // Emulator's URL pattern is like http://hostname[:port]/account/table
  // (or, alternatively, http[s]://account.localhost[:port]/table/)
  // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
  // Exclude account name from req.path for dispatchMiddleware
  tableContext.dispatchPattern =
    tableSection !== undefined ? `/${tableSection}` : "/";

  logger.info(
    `tableStorageContextMiddleware: Account=${account} tableName=${tableSection}}`,
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
