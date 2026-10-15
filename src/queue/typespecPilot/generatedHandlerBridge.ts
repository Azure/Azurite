import type { RequestHandler } from "express";

import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import type { IServiceHandler } from "./generated/handlers";
import { operations, type OperationMetadata } from "./generated/metadata";

type GeneratedHandlerMethod = (
  params: Record<string, unknown>,
  context: { readonly contextId: string }
) => Promise<unknown>;

function getOperationMetadata(operation: Operation): OperationMetadata {
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

function getHandlerMethodName(operationName: string): keyof IServiceHandler {
  // The emitter keeps operation names but lower-camel-cases IServiceHandler methods.
  return `${operationName[0].toLowerCase()}${operationName.slice(
    1
  )}` as keyof IServiceHandler;
}

// This bridge only picks the generated handler method; middleware still owns wire conversion.
export default function createGeneratedHandlerBridge(
  handler: IServiceHandler,
  contextPath: string
): RequestHandler {
  return (_req, res, next) => {
    // Rebuild the same Context view that dispatch/deserialization stored in res.locals.
    const context = new Context(res.locals, contextPath);
    if (
      context.operation === undefined ||
      context.handlerParameters === undefined
    ) {
      return next(
        new TypeError(
          "Generated handler bridge requires dispatch and deserialization to run first"
        )
      );
    }

    const metadata = getOperationMetadata(context.operation);
    const methodName = getHandlerMethodName(metadata.name);
    const method = handler[methodName] as unknown as GeneratedHandlerMethod;

    method
      .call(handler, context.handlerParameters, {
        contextId: context.contextID ?? ""
      })
      .then((response) => {
        context.handlerResponses = response;
      })
      .then(next)
      .catch(next);
  };
}
