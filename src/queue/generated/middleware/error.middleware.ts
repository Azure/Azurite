import Context from "../Context";
import MiddlewareError from "../errors/MiddlewareError";
import IRequest from "../IRequest";
import IResponse from "../IResponse";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import StorageErrorFactory from "../../errors/StorageErrorFactory";

/**
 * ErrorMiddleware handles following 2 kinds of errors thrown from previous middleware or handlers:
 *
 * 1. MiddlewareError will be serialized.
 *    This includes most of expected errors, such as 4XX or some 5xx errors are MiddlewareError.
 *
 * 2. Other unexpected errors will be serialized to 500 Internal Server error directly.
 *    Every this kind of error should be carefully checked, and consider to handle it as a MiddlewareError.
 *
 * @export
 * @param {Context} context
 * @param {(MiddlewareError | Error)} err A MiddlewareError or Error object
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {NextFunction} next An express middleware next callback
 * @param {ILogger} logger A valid logger
 * @returns {void}
 */
export default function errorMiddleware(
  context: Context,
  err: MiddlewareError | Error,
  req: IRequest,
  res: IResponse,
  next: NextFunction,
  logger: ILogger
): void {
  if (res.headersSent()) {
    logger.warn(
      `Error middleware received an error, but response.headersSent is true, pass error to next middleware`,
      context.contextID
    );
    return next(err);
  }

  let responseError: MiddlewareError;
  if (err instanceof MiddlewareError) {
    responseError = err;
  } else if (err instanceof Error) {
    logger.error(
      `ErrorMiddleware: Received an error, fill error information to HTTP response`,
      context.contextID
    );
    logger.error(
      `ErrorMiddleware: ErrorName=${err.name} ErrorMessage=${
        err.message
      } ErrorStack=${JSON.stringify(err.stack)}`,
      context.contextID
    );
    responseError = StorageErrorFactory.InternalError(context.contextID);
  } else {
    logger.warn(
      `ErrorMiddleware: Received unhandled error object`,
      context.contextID
    );
    return next();
  }

  if (responseError instanceof MiddlewareError) {
    logger.error(
      `ErrorMiddleware: Received a MiddlewareError, fill error information to HTTP response`,
      context.contextID
    );

    logger.error(
      `ErrorMiddleware: ErrorName=${responseError.name} ErrorMessage=${
        responseError.message
      }  ErrorHTTPStatusCode=${responseError.statusCode} ErrorHTTPStatusMessage=${
        responseError.statusMessage
      } ErrorHTTPHeaders=${JSON.stringify(
        responseError.headers
      )} ErrorHTTPBody=${JSON.stringify(responseError.body)} ErrorStack=${JSON.stringify(
        responseError.stack
      )}`,
      context.contextID
    );

    logger.error(
      `ErrorMiddleware: Set HTTP code: ${responseError.statusCode}`,
      context.contextID
    );

    res.setStatusCode(responseError.statusCode);
    if (responseError.statusMessage) {
      logger.error(
        `ErrorMiddleware: Set HTTP status message: ${responseError.statusMessage}`,
        context.contextID
      );
      res.setStatusMessage(responseError.statusMessage);
    }

    if (responseError.headers) {
      for (const key in responseError.headers) {
        if (responseError.headers.hasOwnProperty(key)) {
          const value = responseError.headers[key];
          if (value) {
            logger.error(
              `ErrorMiddleware: Set HTTP Header: ${key}=${value}`,
              context.contextID
            );
            res.setHeader(key, value);
          }
        }
      }
    }

    if (responseError.contentType && req.getMethod() !== "HEAD") {
      logger.error(
        `ErrorMiddleware: Set content type: ${responseError.contentType}`,
        context.contextID
      );
      res.setContentType(responseError.contentType);
    }

    logger.error(
      `ErrorMiddleware: Set HTTP body: ${JSON.stringify(responseError.body)}`,
      context.contextID
    );
    if (responseError.body && req.getMethod() !== "HEAD") {
      res.getBodyStream().write(responseError.body);
    }
  }

  next();
}
