import Operation from "../artifacts/operation";
import Specifications from "../artifacts/specifications";
import Context from "../Context";
import DeserializationError from "../errors/DeserializationError";
import OperationMismatchError from "../errors/OperationMismatchError";
import IRequest from "../IRequest";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import { deserialize } from "../utils/serializer";

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

  if (context.operation === undefined) {
    const handlerError = new OperationMismatchError();
    logger.error(
      `DeserializerMiddleware: ${handlerError.message}`,
      context.contextId
    );
    return next(handlerError);
  }

  if (Specifications[context.operation] === undefined) {
    logger.warn(
      `DeserializerMiddleware: Cannot find deserializer for operation ${
        Operation[context.operation]
      }`
    );
  }

  deserialize(context, req, Specifications[context.operation], logger)
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
