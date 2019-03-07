import { NextFunction, Request, Response } from "express";

import logger from "../../common/Logger";
import StorageError from "../errors/StorageError";
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
  // TODO: Use GUID for a server request ID
  const requestID = new Date().getTime().toString();

  const blobContext = new BlobStorageContext(res.locals, DEFAULT_CONTEXT_PATH);
  blobContext.xMsRequestID = requestID;
  blobContext.startTime = new Date();

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
  const blob = paths[2];

  blobContext.account = account;
  blobContext.container = container;
  blobContext.blob = blob;

  if (!account) {
    const handlerError = new StorageError(
      400,
      "InvalidQueryParameterValue",
      `Value for one of the query parameters specified in the request URI is invalid`,
      blobContext.contextID!
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
