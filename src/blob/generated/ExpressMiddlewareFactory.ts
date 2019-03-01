import { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

import Context from "./Context";
import ExpressRequestAdapter from "./ExpressRequestAdapter";
import ExpressResponseAdapter from "./ExpressResponseAdapter";
import IHandlers from "./handlers/IHandlers";
import deserializerMiddleware from "./middleware/deserializer.middleware";
import dispatchMiddleware from "./middleware/dispatch.middleware";
import endMiddleware from "./middleware/end.middleware";
import errorMiddleware from "./middleware/error.middleware";
import HandlerMiddlewareFactory from "./middleware/HandlerMiddlewareFactory";
import serializerMiddleware from "./middleware/serializer.middleware";
import MiddlewareFactory from "./MiddlewareFactory";
import ILogger from "./utils/ILogger";

/**
 * ExpressMiddlewareFactory will generate Express compatible middleware according to swagger definitions.
 * Generated middleware MUST be used by strict order:
 *  * dispatchMiddleware
 *  * DeserializerMiddleware
 *  * HandlerMiddleware
 *  * SerializerMiddleware
 *  * ErrorMiddleware
 *  * EndMiddleware
 *
 * @export
 * @class MiddlewareFactory
 */
export default class ExpressMiddlewareFactory extends MiddlewareFactory {
  /**
   * Creates an instance of MiddlewareFactory.
   *
   * @param {ILogger} logger A valid logger
   * @param {string} [contextPath="default_context"] Optional. res.locals[contextPath] will be used to hold context
   * @memberof MiddlewareFactory
   */
  public constructor(
    logger: ILogger,
    private readonly contextPath: string = "default_context"
  ) {
    super(logger);
  }

  /**
   * DispatchMiddleware is the 1s middleware should be used among other generated middleware.
   *
   * @returns {RequestHandler}
   * @memberof MiddlewareFactory
   */
  public createDispatchMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      dispatchMiddleware(
        new Context(res.locals, this.contextPath),
        new ExpressRequestAdapter(req),
        next,
        this.logger,
      );
    };
  }

  /**
   * DeserializerMiddleware is the 2nd middleware should be used among other generated middleware.
   *
   * @returns {RequestHandler}
   * @memberof MiddlewareFactory
   */
  public createDeserializerMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      deserializerMiddleware(
        new Context(res.locals, this.contextPath),
        new ExpressRequestAdapter(req),
        next,
        this.logger,
      );
    };
  }

  /**
   * HandlerMiddleware is the 3rd middleware should be used among other generated middleware.
   *
   * @param {IHandlers} handlers
   * @returns {RequestHandler}
   * @memberof MiddlewareFactory
   */
  public createHandlerMiddleware(handlers: IHandlers): RequestHandler {
    const handlerMiddlewareFactory = new HandlerMiddlewareFactory(
      handlers,
      this.logger
    );
    return (_req: Request, res: Response, next: NextFunction) => {
      handlerMiddlewareFactory.createHandlerMiddleware()(
        new Context(res.locals, this.contextPath),
        next,
      );
    };
  }

  /**
   * SerializerMiddleware is the 4st middleware should be used among other generated middleware.
   *
   * @returns {RequestHandler}
   * @memberof MiddlewareFactory
   */
  public createSerializerMiddleware(): RequestHandler {
    return (_req: Request, res: Response, next: NextFunction) => {
      serializerMiddleware(
        new Context(res.locals, this.contextPath),
        new ExpressResponseAdapter(res),
        next,
        this.logger,
      );
    };
  }

  /**
   * ErrorMiddleware is the 5st middleware should be used among other generated middleware.
   *
   * @returns {ErrorRequestHandler}
   * @memberof MiddlewareFactory
   */
  public createErrorMiddleware(): ErrorRequestHandler {
    return (err: Error, _req: Request, res: Response, next: NextFunction) => {
      errorMiddleware(
        new Context(res.locals, this.contextPath),
        err,
        new ExpressResponseAdapter(res),
        next,
        this.logger,
      );
    };
  }

  /**
   * EndMiddleware is the 6st middleware should be used among other generated middleware.
   *
   * @returns {RequestHandler}
   * @memberof MiddlewareFactory
   */
  public createEndMiddleware(): RequestHandler {
    return (_req: Request, res: Response) => {
      endMiddleware(
        new Context(res.locals, this.contextPath),
        new ExpressResponseAdapter(res),
        this.logger,
      );
    };
  }
}
