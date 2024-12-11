import { AzuriteTelemetryClient } from '../../common/Telemetry';
import Context from '../generated/Context';
import { NextFunction } from '../generated/MiddlewareFactory';
import {
  Request,
  RequestHandler,
  Response
} from "express";
import ExpressRequestAdapter from '../generated/ExpressRequestAdapter';
import ExpressResponseAdapter from '../generated/ExpressResponseAdapter';

/**
 * End middleware is used to send out final HTTP response.
 *
 * @export
 * @param {Context} context
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {ILogger} logger A valid logger
 */
function telemetryMiddleware(
  context: Context,
  next: NextFunction,
): void {
  AzuriteTelemetryClient.TraceRequest(context);

  next();
}


export default class TelemetryMiddlewareFactory {
  constructor(
    private readonly contextPath: string = "default_context") {}

  /**
   * TelemetryMiddleware is used to send telemetry for requests.
   *
   * @returns {RequestHandler}
   * @memberof MiddlewareFactory
   */
  public createTelemetryMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const request = new ExpressRequestAdapter(req);
      const response = new ExpressResponseAdapter(res);
      telemetryMiddleware(
        new Context(res.locals, this.contextPath, request, response),
        next
      );
    };
  }
}
