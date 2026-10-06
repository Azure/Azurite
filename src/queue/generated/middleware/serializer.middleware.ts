import Operation from "../artifacts/operation";
import AutoRestSpecifications from "../artifacts/specifications";
import Context from "../Context";
import OperationMismatchError from "../errors/OperationMismatchError";
import IResponse from "../IResponse";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import { serialize } from "../utils/serializer";
import { serializeResponse } from "../../typespecPilot/generated/serialization";

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
    context.contextID
  );

  const operation = context.operation;
  if (operation === undefined) {
    const handlerError = new OperationMismatchError();
    logger.error(
      `SerializerMiddleware: ${handlerError.message}`,
      context.contextID
    );
    return next(handlerError);
  }

  const operationName = Operation[operation];

  try {
    if (serializeResponse(operationName, res, context.handlerResponses)) {
      return next();
    }
  } catch (err) {
    return next(err);
  }

  const specification = AutoRestSpecifications[operation];
  if (specification === undefined) {
    logger.warn(
      `SerializerMiddleware: Cannot find serializer for operation ${operationName}`,
      context.contextID
    );
  }
  serialize(
    context,
    res,
    specification,
    context.handlerResponses,
    logger
  )
    .then(next)
    .catch(next);
}
