import Operation from "../artifacts/operation";
import Context from "../Context";
import UnsupportedRequestError from "../errors/UnsupportedRequestError";
import IRequest from "../IRequest";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import type { OperationMetadata } from "../../typespecPilot/generated/operations";
import { operations } from "../../typespecPilot/generated/operations";

interface RoutableOperation {
  readonly metadata: OperationMetadata;
  readonly realOperation: Operation;
}

function realOperationFromMetadata(op: OperationMetadata): Operation | undefined {
  if (op.operationEnumName === undefined) {
    return undefined;
  }
  const value = (Operation as Record<string, Operation | string | undefined>)[op.operationEnumName];
  return typeof value === "number" ? value : undefined;
}

const ROUTABLE_OPERATIONS: readonly RoutableOperation[] = operations
  .map((op) => ({ metadata: op, realOperation: realOperationFromMetadata(op) }))
  .filter(
    (op): op is RoutableOperation =>
      op.realOperation !== undefined && op.metadata.dispatchPattern !== undefined
  );

function requiredDynamicQueryParamNames(op: OperationMetadata): readonly string[] {
  const literalNames = new Set(op.literalQueryParameters.map((p) => p.name));
  return op.requiredQueryParameters.filter((name) => !literalNames.has(name));
}

function matchResult(
  req: IRequest,
  candidate: RoutableOperation,
  dispatchPattern?: string
): number | undefined {
  const xHttpMethod = req.getHeader("X-HTTP-Method");
  let method = req.getMethod();
  if (xHttpMethod && xHttpMethod.length > 0) {
    const value = xHttpMethod.trim();
    if (value === "GET" || value === "MERGE" || value === "PATCH" || value === "DELETE") {
      method = value;
    }
  }

  if (method.toLowerCase() !== candidate.metadata.verb.toLowerCase()) {
    return undefined;
  }

  const bucket = dispatchPattern !== undefined ? dispatchPattern : req.getPath();
  if (bucket !== candidate.metadata.dispatchPattern) {
    return undefined;
  }

  let score = 0;
  for (const literalQuery of candidate.metadata.literalQueryParameters) {
    if (req.getQuery(literalQuery.name) !== literalQuery.value) {
      return undefined;
    }
    score++;
  }

  for (const name of requiredDynamicQueryParamNames(candidate.metadata)) {
    if (req.getQuery(name) === undefined) {
      return undefined;
    }
    score++;
  }

  return score;
}

/**
 * Dispatch Middleware will try to find out which operation of current HTTP request belongs to,
 * by matching against generated `operations` metadata. Operation enum will be assigned to context
 * object. Make sure dispatchMiddleware is triggered before other generated middleware.
 *
 * @export
 * @param {Context} context Context object
 * @param {IRequest} req An request object
 * @param {NextFunction} next A callback
 * @param {ILogger} logger A valid logger
 * @returns {void}
 */
export default function dispatchMiddleware(
  context: Context,
  req: IRequest,
  next: NextFunction,
  logger: ILogger
): void {
  logger.verbose(`DispatchMiddleware: Dispatching request...`, context.contextID);

  let bestScore = -1;
  for (const candidate of ROUTABLE_OPERATIONS) {
    const score = matchResult(req, candidate, context.dispatchPattern);
    if (score !== undefined && score > bestScore) {
      context.operation = candidate.realOperation;
      bestScore = score;
    }
  }

  if (context.operation === undefined) {
    const handlerError = new UnsupportedRequestError();
    logger.error(`DispatchMiddleware: ${handlerError.message}`, context.contextID);
    return next(handlerError);
  }

  logger.info(`DispatchMiddleware: Operation=${Operation[context.operation]}`, context.contextID);

  next();
}
