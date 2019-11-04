import Operation from "../artifacts/operation";
import Specifications from "../artifacts/specifications";
import Context from "../Context";
import OperationMismatchError from "../errors/OperationMismatchError";
import IResponse from "../IResponse";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import { serialize } from "../utils/serializer";

/**
 * SerializerMiddleware will serialize models into HTTP responses.
 *
 * @export
 * @param {Response} res
 * @param {NextFunction} next
 * @param {ILogger} logger
 * @param {Context} context
 */
export default function serializerMiddleware(
  context: Context,
  res: IResponse,
  next: NextFunction,
  logger: ILogger
): void {
  logger.verbose(
    `SerializerMiddleware: Start serializing...`,
    context.contextId
  );

  if (context.operation === undefined) {
    const handlerError = new OperationMismatchError();
    logger.error(
      `SerializerMiddleware: ${handlerError.message}`,
      context.contextId
    );
    return next(handlerError);
  }

  if (Specifications[context.operation] === undefined) {
    logger.warn(
      `SerializerMiddleware: Cannot find serializer for operation ${
        Operation[context.operation]
      }`,
      context.contextId
    );
  }

  serialize(
    context,
    res,
    Specifications[context.operation],
    context.handlerResponses,
    logger
  )
    .then(next)
    .catch(next);
}
