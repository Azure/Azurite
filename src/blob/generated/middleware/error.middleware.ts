import Context from "../Context";
import MiddlewareError from "../errors/MiddlewareError";
import IRequest from "../IRequest";
import IResponse from "../IResponse";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";

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
      context.contextId
    );
    return next(err);
  }

  // Only handle ServerError, for other customized error types hand over to
  // other error handlers.
  if (err instanceof MiddlewareError) {
    logger.error(
      `ErrorMiddleware: Received a MiddlewareError, fill error information to HTTP response`,
      context.contextId
    );

    logger.error(
      `ErrorMiddleware: ErrorName=${err.name} ErrorMessage=${
        err.message
      }  ErrorHTTPStatusCode=${err.statusCode} ErrorHTTPStatusMessage=${
        err.statusMessage
      } ErrorHTTPHeaders=${JSON.stringify(
        err.headers
      )} ErrorHTTPBody=${JSON.stringify(err.body)} ErrorStack=${JSON.stringify(
        err.stack
      )}`,
      context.contextId
    );

    logger.error(
      `ErrorMiddleware: Set HTTP code: ${err.statusCode}`,
      context.contextId
    );

    res.setStatusCode(err.statusCode);
    if (err.statusMessage) {
      logger.error(
        `ErrorMiddleware: Set HTTP status message: ${err.statusMessage}`,
        context.contextId
      );
      res.setStatusMessage(err.statusMessage);
    }

    if (err.headers) {
      for (const key in err.headers) {
        if (err.headers.hasOwnProperty(key)) {
          const value = err.headers[key];
          if (value) {
            logger.error(
              `ErrorMiddleware: Set HTTP Header: ${key}=${value}`,
              context.contextId
            );
            res.setHeader(key, value);
          }
        }
      }
    }

    if (err.contentType && req.getMethod() !== "HEAD") {
      logger.error(
        `ErrorMiddleware: Set content type: ${err.contentType}`,
        context.contextId
      );
      res.setContentType(err.contentType);
    }

    logger.error(
      `ErrorMiddleware: Set HTTP body: ${JSON.stringify(err.body)}`,
      context.contextId
    );
    if (err.body && req.getMethod() !== "HEAD") {
      res.getBodyStream().write(err.body);
    }
  } else if (err instanceof Error) {
    logger.error(
      `ErrorMiddleware: Received an error, fill error information to HTTP response`,
      context.contextId
    );
    logger.error(
      `ErrorMiddleware: ErrorName=${err.name} ErrorMessage=${
        err.message
      } ErrorStack=${JSON.stringify(err.stack)}`,
      context.contextId
    );
    logger.error(`ErrorMiddleware: Set HTTP code: ${500}`, context.contextId);
    res.setStatusCode(500);

    // logger.error(
    //   `ErrorMiddleware: Set error message: ${err.message}`,
    //   context.contextID
    // );
    // res.getBodyStream().write(err.message);
  } else {
    logger.warn(
      `ErrorMiddleware: Received unhandled error object`,
      context.contextId
    );
  }

  next();
}
