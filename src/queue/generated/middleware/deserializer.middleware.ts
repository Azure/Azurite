import Operation from "../artifacts/operation";
import AutoRestSpecifications from "../artifacts/specifications";
import Context from "../Context";
import DeserializationError from "../errors/DeserializationError";
import OperationMismatchError from "../errors/OperationMismatchError";
import IRequest from "../IRequest";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import { deserialize } from "../utils/serializer";
import { deserializeRequest } from "../../typespecPilot/generated/serialization";

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
    context.contextID
  );

  const operation = context.operation;
  if (operation === undefined) {
    const handlerError = new OperationMismatchError();
    logger.error(
      `DeserializerMiddleware: ${handlerError.message}`,
      context.contextID
    );
    return next(handlerError);
  }

  const operationName = Operation[operation];

  deserializeRequest(operationName, req, context)
    .then(parameters => {
      if (parameters !== undefined) {
        return parameters;
      }

      const specification = AutoRestSpecifications[operation];
      if (specification === undefined) {
        logger.warn(
          `DeserializerMiddleware: Cannot find deserializer for operation ${operationName}`
        );
      }
      return deserialize(context, req, specification, logger);
    })
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
