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

  // TODO: Optimize container/blob name extraction algorithm,
  // because blob names may contain special characters
  const paths = req.path.split("/").filter(value => value.length > 0);

  const account = paths[0];
  const container = paths[1];
  const blob = paths.slice(2).join("/");

  blobContext.account = account ? decodeURIComponent(account) : account;
  blobContext.container = container ? decodeURIComponent(container) : container;
  blobContext.blob = blob ? decodeURIComponent(blob) : blob;

  // Emulator's URL pattern is like http://hostname:port/account/container
  // Create a router to exclude account name from req.path, as url path in swagger doesn't include account
  // Exclude account name from req.path for dispatchMiddleware
  blobContext.dispatchPath =
    "/" +
    [container, blob]
      .filter(value => {
        return value !== undefined && value.length > 0;
      })
      .map(value => {
        // // Dispatch middleware cannot handle path parts including $ and /
        return value.replace(/\$/g, "_").replace(/\//g, "_");
      })
      .join("/");

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
    `BlobStorageContextMiddleware: Account:=${account} Container=${container} Blob=${blob}`,
    requestID
  );
  next();
}
