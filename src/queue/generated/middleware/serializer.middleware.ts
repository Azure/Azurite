import Operation from "../artifacts/operation";
import AutoRestSpecifications from "../artifacts/specifications";
import Context from "../Context";
import OperationMismatchError from "../errors/OperationMismatchError";
import IResponse from "../IResponse";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import { serialize } from "../utils/serializer";
import { getSerializationOperationSpec } from "../../typespecPilot/generated/serialization";

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

  if (context.operation === undefined) {
    const handlerError = new OperationMismatchError();
    logger.error(
      `SerializerMiddleware: ${handlerError.message}`,
      context.contextID
    );
    return next(handlerError);
  }

  const specification =
    getSerializationOperationSpec(Operation[context.operation]) ??
    AutoRestSpecifications[context.operation];

  if (specification === undefined) {
    logger.warn(
      `SerializerMiddleware: Cannot find serializer for operation ${
        Operation[context.operation]
      }`,
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
