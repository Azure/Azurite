import { NextFunction, Request, RequestHandler, Response } from "express";
import uuid from "uuid/v4";

import logger from "../../common/Logger";
import { IP_REGEX } from "../../common/utils/constants";
import { NO_ACCOUNT_HOST_NAMES } from "../../common/utils/constants";
import TableStorageContext from "../context/TableStorageContext";
import {
  DEFAULT_TABLE_CONTEXT_PATH,
  HeaderConstants,
  ValidAPIVersions,
  VERSION,
  SECONDARY_SUFFIX
} from "../utils/constants";
import { checkApiVersion, validateTableName } from "../utils/utils";

export default function createTableStorageContextMiddleware(
  skipApiVersionCheck?: boolean,
  disableProductStyleUrl?: boolean
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return tableStorageContextMiddleware(
      req,
      res,
      next,
      skipApiVersionCheck,
      disableProductStyleUrl
    );
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
  next: NextFunction,
  skipApiVersionCheck?: boolean,
  disableProductStyleUrl?: boolean
): void {
  // Set server header in every Azurite response
  res.setHeader(HeaderConstants.SERVER, `Azurite-Table/${VERSION}`);

  const requestID = uuid();

  const tableContext = new TableStorageContext(
    res.locals,
    DEFAULT_TABLE_CONTEXT_PATH
  );

  tableContext.accept = req.headers.accept;
  tableContext.startTime = new Date();
  tableContext.xMsRequestID = requestID;

  if (!skipApiVersionCheck) {
    const apiVersion = req.header(HeaderConstants.X_MS_VERSION);
    if (apiVersion !== undefined) {
      checkApiVersion(apiVersion, ValidAPIVersions, tableContext);
    }
  }

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

  // tslint:disable-next-line: prefer-const
  let [account, tableSection, isSecondary] = extractStoragePartsFromPath(
    req.hostname,
    req.path,
    disableProductStyleUrl
  );

  tableContext.isSecondary = isSecondary;

  const isGet = req.method.toUpperCase() === "GET";

  // Candidate tableSection
  // undefined - Set Table Service Properties
  // Tables - Create Tables, Query Tables
  // Tables() - Create Tables, Query Tables
  // Tables('mytable')	- Delete Tables, Query Entities
  // mytable - Get/Set Table ACL, Insert Entity, Query Entities
  // mytable(PartitionKey='<partition-key>',RowKey='<row-key>') -
  //        Query Entities, Update Entity, Merge Entity, Delete Entity
  // mytable() - Query Entities
  // TODO: Not allowed create Table with Tables as name
  if (tableSection === undefined || tableSection === "") {
    // Service level operation
    tableContext.tableName = undefined;
  } else if (tableSection === "Tables" || tableSection === "Tables()") {
    // Table name in request body
    tableSection = "Tables";
    tableContext.tableName = undefined;
  } else if (
    tableSection.startsWith("Tables('") &&
    tableSection.endsWith("')")
  ) {
    // Tables('mytable')
    tableContext.tableName = tableSection.substring(8, tableSection.length - 2);

    // Workaround for query entity
    if (isGet) {
      tableSection = `${tableContext.tableName}()`;
    }
  } else if (!tableSection.includes("(") && !tableSection.includes(")")) {
    // mytable
    tableContext.tableName = tableSection;

    // Workaround for query entity
    if (isGet) {
      tableSection = `${tableContext.tableName}()`;
    }
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
    
    const regex = /'([^']|'')*'/g;
    const matches = tableSection?.match(regex);
    tableContext.partitionKey = matches? matches[0].replace(/^'|'$/g, '').replace(/''/g, "'"): undefined;
    tableContext.rowKey = matches? matches[1].replace(/^'|'$/g, '').replace(/''/g, "'"): undefined;

    tableSection = `${tableContext.tableName}(PartitionKey='PLACEHOLDER',RowKey='PLACEHOLDER')`;
  } else if (
    tableSection.includes("(") &&
    tableSection.includes(")") &&
    tableSection.indexOf(")") - tableSection.indexOf("(") === 1
  ) {
    // mytable()
    tableContext.tableName = tableSection.substr(0, tableSection.indexOf("("));
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

  tableContext.authenticationPath = req.path;

  if (isSecondary) {
    const pos = tableContext.authenticationPath.search(SECONDARY_SUFFIX);
    if (pos !== -1)
    {
      tableContext.authenticationPath =
      tableContext.authenticationPath.substr(0, pos) +
      tableContext.authenticationPath.substr(pos + SECONDARY_SUFFIX.length);
    }
  }

  // Emulator's URL pattern is like http://hostname[:port]/account/table
  // (or, alternatively, http[s]://account.localhost[:port]/table/)
  // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
  // Exclude account name from req.path for dispatchMiddleware
  tableContext.dispatchPattern =
    tableSection !== undefined ? `/${tableSection}` : "/";

  logger.debug(
    `tableStorageContextMiddleware: Dispatch pattern string: ${tableContext.dispatchPattern}`,
    requestID
  );

  // validate table name, when table name has value (not undefined or empty string)
  // skip check for system table
  if (tableContext.tableName && !tableContext.tableName.startsWith("$")) {
    validateTableName(tableContext, tableContext.tableName);
  }

  logger.info(
    `tableStorageContextMiddleware: Account=${account} tableName=${tableContext.tableName}`,
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
  path: string,
  disableProductStyleUrl?: boolean
): [string | undefined, string | undefined, boolean | undefined] {
  let account;
  let table;
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
  table = parts[urlPartIndex++];

  if (account.endsWith(SECONDARY_SUFFIX)) {
    account = account.substr(0, account.length - SECONDARY_SUFFIX.length);
    isSecondary = true;
  }

  return [account, table, isSecondary];
}
