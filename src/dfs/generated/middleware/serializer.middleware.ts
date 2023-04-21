import OperationMismatchError from '../../../blob/generated/errors/OperationMismatchError';
import IResponse from '../../../blob/generated/IResponse';
import { NextFunction } from '../../../blob/generated/MiddlewareFactory';
import { serialize } from '../../../blob/generated/utils/serializer';
import ILogger from '../../../common/ILogger';
import Operation from '../artifacts/operation';
import Specifications from '../artifacts/specifications';
import Context from '../../../blob/generated/Context';

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

  if (context.context.dfsOperation === undefined) {
    const handlerError = new OperationMismatchError();
    logger.error(
      `SerializerMiddleware: ${handlerError.message}`,
      context.contextId
    );
    return next(handlerError);
  }

  if (Specifications[context.context.dfsOperation] === undefined) {
    logger.warn(
      `SerializerMiddleware: Cannot find serializer for operation ${
        Operation[context.context.dfsOperation]
      }`,
      context.contextId
    );
  }

  serialize(
    context,
    res,
    Specifications[context.context.dfsOperation],
    context.handlerResponses,
    logger
  )
    .then(next)
    .catch(next);
}
