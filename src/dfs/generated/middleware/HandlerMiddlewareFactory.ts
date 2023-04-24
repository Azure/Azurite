import OperationMismatchError from '../../../blob/generated/errors/OperationMismatchError';
import { NextFunction } from '../../../blob/generated/MiddlewareFactory';
import ILogger from '../../../common/ILogger';
import Operation from '../artifacts/operation';
import Specifications from '../artifacts/specifications';
import Context from '../../../blob/generated/Context';
import getHandlerByOperation from '../handlers/handlerMappers';
import IHandlers from '../handlers/IHandlers';

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
        context.contextId
      );

      if (context.context.dfsOperation === undefined) {
        const handlerError = new OperationMismatchError();
        this.logger.error(
          `HandlerMiddleware: ${handlerError.message}`,
          context.contextId
        );
        return next(handlerError);
      }

      if (Specifications[context.context.dfsOperation] === undefined) {
        this.logger.warn(
          `HandlerMiddleware: cannot find handler for operation ${
            Operation[context.context.dfsOperation]
          }`
        );
      }

      // We assume handlerPath always exists for every generated operation in generated code
      const handlerPath = getHandlerByOperation(context.context.dfsOperation)!;

      const args = [];
      for (const arg of handlerPath.arguments) {
        args.push(context.handlerParameters![arg]);
      }
      args.push(context);

      const handler = (this.handlers as any)[handlerPath.handler];
      const handlerMethod = handler[handlerPath.method] as () => Promise<any>;
      handlerMethod
        .apply(handler, args as any)
        .then((response: any) => {
          context.handlerResponses = response;
        })
        .then(next)
        .catch(next);
    };
  }
}
