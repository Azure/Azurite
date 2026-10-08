import Operation from "../artifacts/operation";
import Context from "../Context";
import UnsupportedRequestError from "../errors/UnsupportedRequestError";
import IRequest from "../IRequest";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import {
  getURITemplateParameters,
  isURITemplateMatch
} from "../utils/utils";
import type { OperationMetadata } from "../../typespecPilot/generated/metadata";
import { operations } from "../../typespecPilot/generated/metadata";

type DispatchOperationMetadata = Pick<
  OperationMetadata,
  | "name"
  | "verb"
  | "path"
  | "interfaceName"
  | "literalQueryParameters"
  | "requiredQueryParameters"
  | "requiredHeaderParameters"
  | "parameters"
>;

const legacyHeadOperations: readonly DispatchOperationMetadata[] = [
  // Keep the two HEAD routes from generated/artifacts/specifications.ts until TypeSpec declares them.
  {
    name: "Queue_GetPropertiesWithHead",
    verb: "head",
    path: "/",
    interfaceName: "Queue",
    literalQueryParameters: [],
    requiredQueryParameters: [],
    requiredHeaderParameters: ["x-ms-version"],
    parameters: []
  },
  {
    name: "Queue_GetAccessPolicyWithHead",
    verb: "head",
    path: "/",
    interfaceName: "Queue",
    literalQueryParameters: [{ name: "comp", value: "acl" }],
    requiredQueryParameters: [],
    requiredHeaderParameters: ["x-ms-version"],
    parameters: []
  }
];

const dispatchOperations: readonly DispatchOperationMetadata[] = [
  ...operations,
  ...legacyHeadOperations.filter(
    (legacy) =>
      !operations.some((operation) => operation.name === legacy.name)
  )
];

function getDispatchPathTemplate(metadata: DispatchOperationMetadata): string {
  // Queue names are client-scoped in TypeSpec but still live in Azurite's request path.
  if (metadata.interfaceName !== "Queue") {
    return metadata.path || "/";
  }
  return metadata.path === "/" ? "/{queueName}" : `/{queueName}${metadata.path}`;
}

function getExistingOperation(
  metadata: DispatchOperationMetadata
): Operation | undefined {
  // Only dispatch operations that existing auth/preflight/handler maps can identify.
  const operation = Operation[metadata.name as keyof typeof Operation];
  return typeof operation === "number" ? operation : undefined;
}

function isRequestAgainstOperation(
  req: IRequest,
  metadata: DispatchOperationMetadata | undefined,
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
  let selectedMetadata: DispatchOperationMetadata | undefined;

  for (const metadata of dispatchOperations) {
    const operation = getExistingOperation(metadata);
    if (operation === undefined) {
      continue;
    }

    const res = isRequestAgainstOperation(req, metadata, context.dispatchPattern);
    if (res[0] && res[1] > conditionsMet) {
      context.operation = operation;
      selectedMetadata = metadata;
      conditionsMet = res[1];
    }
  }

  if (context.operation === undefined) {
    const handlerError = new UnsupportedRequestError();
    logger.error(`DispatchMiddleware: ${handlerError.message}`, context.contextID);
    return next(handlerError);
  }

  const pathTemplate = getDispatchPathTemplate(selectedMetadata!);
  // Context.context is where src/queue/generated/Context.ts keeps path values for handlers.
  const pathParameters =
    getURITemplateParameters(req.getPath(), pathTemplate) ??
    (context.dispatchPattern !== undefined
      ? getURITemplateParameters(context.dispatchPattern, pathTemplate)
      : undefined);
  for (const parameter of selectedMetadata!.parameters) {
    if (
      parameter.location === "path" &&
      context.context[parameter.name] === undefined
    ) {
      context.context[parameter.name] =
        pathParameters?.[parameter.wireName] ??
        pathParameters?.[parameter.name];
    }
  }

  logger.info(`DispatchMiddleware: Operation=${Operation[context.operation]}`, context.contextID);

  next();
}
