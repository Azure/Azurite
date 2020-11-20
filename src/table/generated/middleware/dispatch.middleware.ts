import * as msRest from "@azure/ms-rest-js";

import Operation from "../artifacts/operation";
import Specifications from "../artifacts/specifications";
import Context from "../Context";
import UnsupportedRequestError from "../errors/UnsupportedRequestError";
import IRequest from "../IRequest";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import { isURITemplateMatch } from "../utils/utils";

/**
 * Dispatch Middleware will try to find out which operation of current HTTP request belongs to,
 * by going through request specifications. Operation enum will be assigned to context object.
 * Make sure dispatchMiddleware is triggered before other generated middleware.
 *
 * TODO: Add support for API priorities to deal with both matched APIs
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
  logger.verbose(
    `DispatchMiddleware: Dispatching request...`,
    context.contextID
  );

  // Sometimes, more than one operations specifications are all valid against current request
  // Such as a SetContainerMetadata request will fit both CreateContainer and SetContainerMetadata specifications
  // We need to avoid this kind of situation when define swagger
  // However, following code will try to find most suitable operation by selecting operation which
  // have most required conditions met
  let conditionsMet: number = -1;

  for (const key in Operation) {
    if (Operation.hasOwnProperty(key)) {
      const operation = parseInt(key, 10);
      const res = isRequestAgainstOperation(
        req,
        Specifications[operation],
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
    logger.error(
      `DispatchMiddleware: ${handlerError.message}`,
      context.contextID
    );
    return next(handlerError);
  }

  logger.info(
    `DispatchMiddleware: Operation=${Operation[context.operation]}`,
    context.contextID
  );

  next();
}

/**
 * Validation whether current request meets request operation specification.
 *
 * @param {IRequest} req
 * @param {msRest.OperationSpec} spec
 * @returns {[boolean, number]} Tuple includes validation result and number of met required conditions
 */
function isRequestAgainstOperation(
  req: IRequest,
  spec: msRest.OperationSpec,
  dispatchPathPattern?: string
): [boolean, number] {
  let metConditionsNum = 0;
  if (req === undefined || spec === undefined) {
    return [false, metConditionsNum];
  }

  const xHttpMethod = req.getHeader("X-HTTP-Method");
  let method = req.getMethod();
  if (xHttpMethod && xHttpMethod.length > 0) {
    const value = xHttpMethod.trim();
    if (
      value === "GET" ||
      value === "MERGE" ||
      value === "PATCH" ||
      value === "DELETE"
    ) {
      method = value;
    }
  }

  // Validate HTTP method
  if (method !== spec.httpMethod) {
    return [false, metConditionsNum++];
  }

  // Validate URL path
  const path = spec.path
    ? spec.path.startsWith("/")
      ? spec.path
      : `/${spec.path}`
    : "/";
  if (
    !isURITemplateMatch(
      // Use dispatch path with priority
      dispatchPathPattern !== undefined ? dispatchPathPattern : req.getPath(),
      path
    )
  ) {
    return [false, metConditionsNum++];
  }

  // Validate required queryParameters
  for (const queryParameter of spec.queryParameters || []) {
    if (queryParameter.mapper.required) {
      const queryValue = req.getQuery(
        queryParameter.mapper.serializedName || ""
      );
      if (queryValue === undefined) {
        return [false, metConditionsNum];
      }

      if (
        queryParameter.mapper.type.name === "Enum" &&
        queryParameter.mapper.type.allowedValues.findIndex((val) => {
          return val === queryValue;
        }) < 0
      ) {
        return [false, metConditionsNum];
      }

      if (
        queryParameter.mapper.isConstant &&
        queryParameter.mapper.defaultValue !== queryValue
      ) {
        return [false, metConditionsNum];
      }

      metConditionsNum++;
    }
  }

  // Validate required header parameters
  for (const headerParameter of spec.headerParameters || []) {
    if (headerParameter.mapper.required) {
      const headerValue = req.getHeader(
        headerParameter.mapper.serializedName || ""
      );
      if (headerValue === undefined) {
        return [false, metConditionsNum];
      }

      if (
        headerParameter.mapper.type.name === "Enum" &&
        headerParameter.mapper.type.allowedValues.findIndex((val) => {
          return val === headerValue;
        }) < 0
      ) {
        return [false, metConditionsNum];
      }

      if (
        headerParameter.mapper.isConstant &&
        `${headerParameter.mapper.defaultValue || ""}`.toLowerCase() !==
          headerValue.toLowerCase()
      ) {
        return [false, metConditionsNum];
      }

      metConditionsNum++;
    }
  }

  return [true, metConditionsNum];
}
