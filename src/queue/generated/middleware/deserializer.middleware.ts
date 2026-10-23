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
import { NumericConstraintError } from "../../typespecPilot/runtime/serializationRuntime";
import StorageErrorFactory from "../../errors/StorageErrorFactory";

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

      // Fall back for legacy-only operations until the TypeSpec service describes every route.
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
      if (err instanceof NumericConstraintError && err.location === "query") {
        // Keep the error shape returned by Queue handlers for out-of-range query values.
        const minimum =
          err.constraints.min ?? err.constraints.minExclusive;
        const maximum =
          err.constraints.max ?? err.constraints.maxExclusive;
        return next(
          StorageErrorFactory.getOutOfRangeQueryParameterValue(
            context.contextID,
            {
              QueryParameterName: err.wireName,
              QueryParameterValue: `${err.value}`,
              ...(minimum === undefined
                ? {}
                : { MinimumAllowed: `${minimum}` }),
              ...(maximum === undefined
                ? {}
                : { MaximumAllowed: `${maximum}` })
            }
          )
        );
      }
      const deserializationError = new DeserializationError(err.message);
      deserializationError.stack = err.stack;
      next(deserializationError);
    });
}
