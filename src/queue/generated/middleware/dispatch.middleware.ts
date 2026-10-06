import Operation from "../artifacts/operation";
import Context from "../Context";
import UnsupportedRequestError from "../errors/UnsupportedRequestError";
import IRequest from "../IRequest";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import { isURITemplateMatch } from "../utils/utils";
import type { OperationMetadata } from "../../typespecPilot/generated/operations";
import { operations } from "../../typespecPilot/generated/operations";

const OPERATIONS_BY_NAME: ReadonlyMap<string, OperationMetadata> = new Map(
  operations.map((op) => [op.name, op])
);

function getGeneratedOperation(operation: Operation): OperationMetadata | undefined {
  return OPERATIONS_BY_NAME.get(Operation[operation]);
}

function getDispatchPathTemplate(metadata: OperationMetadata): string {
  if (metadata.interfaceName !== "Queue") {
    return metadata.path || "/";
  }
  return metadata.path === "/" ? "/{queueName}" : `/{queueName}${metadata.path}`;
}

function isRequestAgainstOperation(
  req: IRequest,
  metadata: OperationMetadata | undefined,
  dispatchPattern?: string
): [boolean, number] {
  let metConditionsNum = 0;
  if (req === undefined || metadata === undefined) {
    return [false, metConditionsNum];
  }

  const xHttpMethod = req.getHeader("X-HTTP-Method");
  let method = req.getMethod();
  if (xHttpMethod && xHttpMethod.length > 0) {
    const value = xHttpMethod.trim();
    if (value === "GET" || value === "MERGE" || value === "PATCH" || value === "DELETE") {
      method = value;
    }
  }

  if (method.toLowerCase() !== metadata.verb.toLowerCase()) {
    return [false, metConditionsNum++];
  }

  if (
    !isURITemplateMatch(
      dispatchPattern !== undefined ? dispatchPattern : req.getPath(),
      getDispatchPathTemplate(metadata)
    )
  ) {
    return [false, metConditionsNum++];
  }

  for (const literalQuery of metadata.literalQueryParameters) {
    if (req.getQuery(literalQuery.name) !== literalQuery.value) {
      return [false, metConditionsNum];
    }
    metConditionsNum++;
  }

  const literalQueryNames = new Set(metadata.literalQueryParameters.map((p) => p.name));
  for (const name of metadata.requiredQueryParameters) {
    if (literalQueryNames.has(name)) {
      continue;
    }
    if (req.getQuery(name) === undefined) {
      return [false, metConditionsNum];
    }
    metConditionsNum++;
  }

  for (const name of metadata.requiredHeaderParameters) {
    if (req.getHeader(name) === undefined) {
      return [false, metConditionsNum];
    }
    metConditionsNum++;
  }

  return [true, metConditionsNum];
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

  let conditionsMet: number = -1;

  for (const key in Operation) {
    if (Operation.hasOwnProperty(key)) {
      const operation = parseInt(key, 10);
      const res = isRequestAgainstOperation(
        req,
        getGeneratedOperation(operation),
        context.dispatchPattern
      );
      if (res[0] && res[1] > conditionsMet) {
        context.operation = operation;
        conditionsMet = res[1];
      }
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
