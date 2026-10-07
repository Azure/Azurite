import Operation from "../artifacts/operation";
import Specifications from "../artifacts/specifications";
import Context from "../Context";
import OperationMismatchError from "../errors/OperationMismatchError";
import getHandlerByOperation from "../handlers/handlerMappers";
import IHandlers from "../handlers/IHandlers";
import { NextFunction } from "../MiddlewareFactory";
import ILogger from "../utils/ILogger";
import {
  operations,
  type OperationMetadata
} from "../../typespecPilot/generated/operations";

function getGeneratedOperation(operation: Operation): OperationMetadata {
  const operationName = Operation[operation];
  const metadata = operations.find(
    (candidate) => candidate.name === operationName
  );
  if (metadata === undefined) {
    throw new TypeError(
      `Generated TypeSpec metadata does not include operation ${operationName}`
    );
  }
  return metadata;
}

function getLegacyParameterName(wireName: string, name: string): string {
  if (wireName.toLowerCase() === "x-ms-client-request-id") {
    return "requestId";
  }
  if (wireName.toLowerCase() === "visibilitytimeout") {
    return "visibilitytimeout";
  }
  return name;
}

function adaptGeneratedParameters(
  metadata: OperationMetadata,
  handlerArguments: readonly string[],
  parameters: Record<string, any>
): Record<string, any> {
  const adapted: Record<string, any> = {};
  const options: Record<string, any> = {};

  for (const parameter of metadata.parameters) {
    const value = parameters[parameter.name];
    const legacyName = getLegacyParameterName(
      parameter.wireName,
      parameter.name
    );
    if (parameter.required) {
      adapted[legacyName] = value;
    } else if (value !== undefined) {
      options[legacyName] = value;
    }
  }

  if (handlerArguments.includes("options")) {
    adapted.options = options;
  }
  if (metadata.hasRequestBody) {
    const bodyArgument = handlerArguments.find(
      (argument) => argument !== "options" && adapted[argument] === undefined
    );
    if (bodyArgument !== undefined) {
      adapted[bodyArgument] = parameters.body;
    } else if (metadata.name === "Queue_SetAccessPolicy") {
      options.queueAcl = parameters.body.items;
    }
  }

  return adapted;
}

function adaptLegacyResponse(
  metadata: OperationMetadata,
  response: Record<string, any>
): Record<string, any> {
  const responseMetadata =
    metadata.responses.find(
      (candidate) => candidate.statusCode === response.statusCode
    ) ??
    metadata.responses.find((candidate) => candidate.statusCode === "*");
  if (responseMetadata === undefined) {
    return response;
  }

  const headerNames = new Set(
    responseMetadata.headers.map((header) => header.name)
  );
  const headers: Record<string, any> = {};
  for (const headerName of headerNames) {
    if (response[headerName] !== undefined) {
      headers[headerName] = response[headerName];
    }
  }

  const adapted: Record<string, any> = {
    statusCode: response.statusCode,
    headers
  };
  if (responseMetadata.body !== undefined) {
    if (Array.isArray(response)) {
      adapted.body = { items: response };
    } else {
      const body: Record<string, any> = {};
      for (const [name, value] of Object.entries(response)) {
        if (name !== "statusCode" && !headerNames.has(name)) {
          body[name] = value;
        }
      }
      adapted.body = body;
    }
  }
  return adapted;
}

/**
 * Auto generated. HandlerMiddlewareFactory will accept handlers and create handler middleware.
 *
 * @export
 * @class HandlerMiddlewareFactory
 */
export default class HandlerMiddlewareFactory {
  /**
   * Creates an instance of HandlerMiddlewareFactory.
   * Accept handlers and create handler middleware.
   *
   * @param {IHandlers} handlers Handlers implemented handler interfaces
   * @param {ILogger} logger A valid logger
   * @memberof HandlerMiddlewareFactory
   */
  constructor(
    private readonly handlers: IHandlers,
    private readonly logger: ILogger
  ) {}

  /**
   * Creates a handler middleware from input handlers.
   *
   * @memberof HandlerMiddlewareFactory
   */
  public createHandlerMiddleware(): (
    context: Context,
    next: NextFunction
  ) => void {
    return (context: Context, next: NextFunction) => {
      this.logger.info(
        `HandlerMiddleware: DeserializedParameters=${JSON.stringify(
          context.handlerParameters,
          (key, value) => {
            if (key === "body") {
              return "ReadableStream";
            }
            return value;
          }
        )}`,
        context.contextID
      );

      if (context.operation === undefined) {
        const handlerError = new OperationMismatchError();
        this.logger.error(
          `HandlerMiddleware: ${handlerError.message}`,
          context.contextID
        );
        return next(handlerError);
      }

      if (Specifications[context.operation] === undefined) {
        this.logger.warn(
          `HandlerMiddleware: cannot find handler for operation ${
            Operation[context.operation]
          }`
        );
      }

      // We assume handlerPath always exists for every generated operation in generated code
      const handlerPath = getHandlerByOperation(context.operation)!;
      const metadata = getGeneratedOperation(context.operation);
      const handlerParameters = adaptGeneratedParameters(
        metadata,
        handlerPath.arguments,
        context.handlerParameters!
      );

      const args = [];
      for (const arg of handlerPath.arguments) {
        args.push(handlerParameters[arg]);
      }
      args.push(context);

      const handler = (this.handlers as any)[handlerPath.handler];
      const handlerMethod = handler[handlerPath.method] as () => Promise<any>;
      handlerMethod
        .apply(handler, args as any)
        .then((response: any) => {
          context.handlerResponses = adaptLegacyResponse(metadata, response);
        })
        .then(next)
        .catch(next);
    };
  }
}
