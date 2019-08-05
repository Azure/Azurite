import IHandlers from "./handlers/IHandlers";
import ILogger from "./utils/ILogger";

export type Callback = (...args: any[]) => any;
export type MiddlewareTypes = Callback;
export type NextFunction = Callback;

/**
 * MiddlewareFactory will generate middleware according to swagger definitions.
 *
 * Generated middleware MUST be used by strict order when you build your HTTP server:
 *  * DispatchMiddleware
 *  * DeserializerMiddleware
 *  * HandlerMiddleware
 *  * SerializerMiddleware
 *  * ErrorMiddleware
 *  * EndMiddleware
 *
 * To compatible with different Node.js server frameworks, such as Express or Koa,
 * Extend this class and implement interfaces IRequest and IResponse as adapters.
 *
 * As above default generated middleware is callback style, you may want to wrap them into promise
 * style for Koa like frameworks. Generated middleware will always trigger callback method at last,
 * and pass all error object as the first parameter of callback method.
 *
 * We already provide implementation for Express framework. Refer to:
 *  * ExpressMiddlewareFactory
 *  * ExpressRequestAdapter
 *  * ExpressResponseAdapter
 *
 * @export
 * @class MiddlewareFactory
 */
export default abstract class MiddlewareFactory {
  /**
   * Creates an instance of MiddlewareFactory.
   *
   * @param {ILogger} logger A valid logger
   * @memberof MiddlewareFactory
   */
  public constructor(protected readonly logger: ILogger) {}

  /**
   * DispatchMiddleware is the 1s middleware should be used among other generated middleware.
   *
   * @returns {MiddlewareTypes}
   * @memberof MiddlewareFactory
   */
  public abstract createDispatchMiddleware(): MiddlewareTypes;

  /**
   * DeserializerMiddleware is the 2nd middleware should be used among other generated middleware.
   *
   * @returns {MiddlewareTypes}
   * @memberof MiddlewareFactory
   */
  public abstract createDeserializerMiddleware(): MiddlewareTypes;

  /**
   * HandlerMiddleware is the 3rd middleware should be used among other generated middleware.
   *
   * @param {IHandlers} handlers
   * @returns {MiddlewareTypes}
   * @memberof MiddlewareFactory
   */
  public abstract createHandlerMiddleware(handlers: IHandlers): MiddlewareTypes;

  /**
   * SerializerMiddleware is the 4st middleware should be used among other generated middleware.
   *
   * @returns {MiddlewareTypes}
   * @memberof MiddlewareFactory
   */
  public abstract createSerializerMiddleware(): MiddlewareTypes;

  /**
   * ErrorMiddleware is the 5st middleware should be used among other generated middleware.
   *
   * @returns {MiddlewareTypes}
   * @memberof MiddlewareFactory
   */
  public abstract createErrorMiddleware(): MiddlewareTypes;

  /**
   * EndMiddleware is the 6st middleware should be used among other generated middleware.
   *
   * @returns {MiddlewareTypes}
   * @memberof MiddlewareFactory
   */
  public abstract createEndMiddleware(): MiddlewareTypes;
}
