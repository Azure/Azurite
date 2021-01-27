import { NextFunction, Request, Response } from "express";
import ILogger from "../../common/ILogger";
import BlobStorageContext from "../context/BlobStorageContext";
import { DEFAULT_CONTEXT_PATH } from "../utils/constants";
import { PartialReadableStream } from "./PartialReadableStream";

type FaultInjectionType =
  | "ServerInternalError"
  | "NoResponseThenWaitIndefinitely"
  | "NoResponseThenCloseConnection"
  | "PartialResponseThenWaitIndefinitely" // only support partial body for stream body
  | "PartialResponseThenCloseConnection"; // only support partial body for stream body

type FaultInjectionPosition =
  | "beforeHandler"
  | "beforeSerializer"
  | "afterSerializer";

export default class PreflightMiddlewareFactory {
  constructor(private readonly logger: ILogger) {}

  public createFaultInjectionMiddleware(position: FaultInjectionPosition) {
    return (req: Request, res: Response, next: NextFunction) => {
      return this.faultInjectionMiddleware(req, res, next, position);
    };
  }

  private faultInjectionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
    position: FaultInjectionPosition
  ): void {
    const injectTypeStr = req.get("fault-inject") as FaultInjectionType;
    if (injectTypeStr === undefined || injectTypeStr.length === 0) {
      return next();
    }

    switch (injectTypeStr) {
      case "ServerInternalError": {
        if (position === "beforeHandler") {
          const errMsg = `[Fault Injection] ${injectTypeStr} error injected at ${position}`;
          this.logger.info(errMsg);
          return next(new Error(errMsg));
        }
        break;
      }
      case "NoResponseThenWaitIndefinitely": {
        if (position === "beforeHandler") {
          this.logger.info(
            `[Fault Injection] ${injectTypeStr} error injected at ${position}`
          );
          // Do nothing, leaving the socket open but never sending a response.
          return;
        }
        break;
      }
      case "NoResponseThenCloseConnection": {
        if (position === "beforeHandler") {
          this.logger.info(
            `[Fault Injection] ${injectTypeStr} error injected at ${position}`
          );
          const socket = req.socket;
          // TCP FIN
          socket.end();
          return;
        }
        break;
      }
      case "PartialResponseThenCloseConnection":
      case "PartialResponseThenWaitIndefinitely": {
        if (position === "beforeSerializer") {
          const context = new BlobStorageContext(
            res.locals,
            DEFAULT_CONTEXT_PATH
          );
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

          return next();
        } else if (position === "afterSerializer") {
          this.logger.info(
            `[Fault Injection] ${injectTypeStr} error injected at ${position}`
          );
          if (injectTypeStr === "PartialResponseThenWaitIndefinitely") {
            // Do nothing, leaving the socket open but never sending a response.
            return;
          } else if (injectTypeStr === "PartialResponseThenCloseConnection") {
            const socket = req.socket;
            // TCP FIN
            socket.end();
            return;
          }
        }
        break;
      }
      default:
        const errMsg3 = `Unsupported fault injection type: ${injectTypeStr}.`;
        this.logger.info(errMsg3);
        return next(new Error(errMsg3));
    }

    return next();
  }
}
