import DeserializationError from '../../../blob/generated/errors/DeserializationError';
import OperationMismatchError from '../../../blob/generated/errors/OperationMismatchError';
import IRequest from '../../../blob/generated/IRequest';
import { NextFunction } from '../../../blob/generated/MiddlewareFactory';
import { deserialize } from '../../../blob/generated/utils/serializer';
import ILogger from '../../../common/ILogger';
import Operation from '../artifacts/operation';
import Specifications from '../artifacts/specifications';
import Context from '../../../blob/generated/Context';

/**
 * Deserializer Middleware. Deserialize incoming HTTP request into models.
 *
 * @export
 * @param {Context} context
 * @param {IRequest} req An IRequest object
 * @param {NextFunction} next An next callback or promise
 * @param {ILogger} logger A valid logger
 * @returns {void}
 */
export default function deserializerMiddleware(
  context: Context,
  req: IRequest,
  next: NextFunction,
  logger: ILogger
): void {
  logger.verbose(
    `DeserializerMiddleware: Start deserializing...`,
    context.contextId
  );

  if (context.context.dfsOperation === undefined) {
    const handlerError = new OperationMismatchError();
    logger.error(
      `DeserializerMiddleware: ${handlerError.message}`,
      context.contextId
    );
    return next(handlerError);
  }

  if (Specifications[context.context.dfsOperation] === undefined) {
    logger.warn(
      `DeserializerMiddleware: Cannot find deserializer for operation ${
        Operation[context.context.dfsOperation]
      }`
    );
  }

  deserialize(context, req, Specifications[context.context.dfsOperation], logger)
    .then(parameters => {
      context.handlerParameters = parameters;
    })
    .then(next)
    .catch(err => {
      const deserializationError = new DeserializationError(err.message);
      deserializationError.stack = err.stack;
      next(deserializationError);
    });
}
