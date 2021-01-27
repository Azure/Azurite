import { Request, Response, NextFunction } from "express";
import ExpressRequestAdapter from "../generated/ExpressRequestAdapter";
import ExpressResponseAdapter from "../generated/ExpressResponseAdapter";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import ILogger from "../../common/ILogger";
import { PartialReadableStream } from "./PartialReadableStream";
import { DEFAULT_CONTEXT_PATH } from "../utils/constants";

type FaultInjectionType =
  | "ServerInternalError"
  | "NoResponseThenWaitIndefinitely"
  | "NoResponseThenCloseConnection"
  | "PartialResponseThenWaitIndefinitely"
  | "PartialResponseThenCloseConnection";

type FaultInjectionPosition =
  | "beforeHandler"
  | "beforeSerializer"
  | "afterSerializer";

export default class PreflightMiddlewareFactory {
  constructor(private readonly logger: ILogger) {}

  // express middleware
  public createFaultInjectionMiddleware(position: FaultInjectionPosition) {
    return (req: Request, res: Response, next: NextFunction) => {
      const request = new ExpressRequestAdapter(req);
      const response = new ExpressResponseAdapter(res);
      const context = new Context(
        res.locals,
        DEFAULT_CONTEXT_PATH,
        request,
        response
      );

      this.faultInject(context, request, position)
        .then((shouldContinue?: boolean) => {
          if (shouldContinue) {
            return next();
          }
        })
        .catch(next);
    };
  }

  // Decoupled from express.
  // Return true when should continue the flow to call the nextFunction while returning false means the flow should terminate.
  private faultInject(
    context: Context,
    req: IRequest,
    position: FaultInjectionPosition
  ): Promise<boolean> {
    return new Promise(resolve => {
      const injectTypeStr = req.getHeader("fault-inject") as FaultInjectionType;
      if (injectTypeStr === undefined || injectTypeStr.length === 0) {
        return resolve(true);
      }

      switch (injectTypeStr) {
        case "ServerInternalError": {
          if (position === "beforeHandler") {
            const errMsg = `[Fault Injection] ${injectTypeStr} error injected at ${position}`;
            this.logger.info(errMsg);
            throw new Error(errMsg);
          }
          break;
        }
        case "NoResponseThenWaitIndefinitely": {
          if (position === "beforeHandler") {
            this.logger.info(
              `[Fault Injection] ${injectTypeStr} error injected at ${position}`
            );
            // Do nothing, leaving the socket open but never sending a response.
            return resolve(false);
          }
          break;
        }
        case "NoResponseThenCloseConnection": {
          if (position === "beforeHandler") {
            this.logger.info(
              `[Fault Injection] ${injectTypeStr} error injected at ${position}`
            );
            const socket = req.getSocket();
            // TCP FIN
            socket.end();
            return resolve(false);
          }
          break;
        }
        case "PartialResponseThenCloseConnection":
        case "PartialResponseThenWaitIndefinitely": {
          if (position === "beforeSerializer") {
            // set the serializer body inject callback
            context.serializerResBodyInjectCallback = (
              body: string | NodeJS.ReadableStream
            ) => {
              if (typeof body === "string") {
                if (body.length !== 0) {
                  return body.slice(0, -1);
                } else {
                  this.logger.info(
                    `[Fault Injection] Empty body, can't inject ${injectTypeStr}`
                  );
                  return body;
                }
              } else {
                return new PartialReadableStream(body);
              }
            };

            return resolve(true);
          } else if (position === "afterSerializer") {
            this.logger.info(
              `[Fault Injection] ${injectTypeStr} error injected at ${position}`
            );
            if (injectTypeStr === "PartialResponseThenWaitIndefinitely") {
              // Do nothing, leaving the socket open but never sending a response.
              return resolve(false);
            } else if (injectTypeStr === "PartialResponseThenCloseConnection") {
              const socket = req.getSocket();
              // TCP FIN
              socket.end();
              return resolve(false);
            }
          }
          break;
        }
        default:
          const errMsg3 = `Unsupported fault injection type: ${injectTypeStr}.`;
          this.logger.info(errMsg3);
          throw new Error(errMsg3);
      }

      return resolve(true);
    });
  }
}
