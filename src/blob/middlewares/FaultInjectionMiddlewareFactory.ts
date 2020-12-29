import { NextFunction, Request, Response } from "express";
import ILogger from "../../common/ILogger";
import BlobStorageContext from "../context/BlobStorageContext";
import { DEFAULT_CONTEXT_PATH } from "../utils/constants";
import { PartialReadableStream } from "./PartialReadableStream";

type FaultInjectionType =
  | "serverInternalError"
  | "timeout"
  | "closeConnection"
  | "partialResponseThenTimeout" // only support partial body for stream body
  | "partialResponseThenCloseConnection"; // only support partial body for stream body

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
    switch (injectTypeStr) {
      case "serverInternalError": {
        if (position === "beforeHandler") {
          const errMsg = `[Fault Injection] Server internal error injected.`;
          this.logger.info(errMsg);
          return next(new Error(errMsg));
        }
        break;
      }
      case "timeout": {
        if (position === "beforeHandler") {
          this.logger.info("[Fault Injection] Timeout error injected");
          // Do nothing, leaving the socket open but never sending a response.
          return;
        }
        break;
      }
      case "closeConnection": {
        if (position === "beforeHandler") {
          this.logger.info("[Fault Injection] Close connection injected");
          const socket = req.socket;
          // TCP FIN
          socket.end();
          return;
        }
        break;
      }
      case "partialResponseThenCloseConnection":
      case "partialResponseThenTimeout": {
        if (position === "beforeSerializer") {
          const context = new BlobStorageContext(
            res.locals,
            DEFAULT_CONTEXT_PATH
          );
          const body = context.handlerResponses.body;
          if (body) {
            this.logger.info(
              `[Fault Injection] ${injectTypeStr} error injected at ${position}`
            );
            context.handlerResponses.body = new PartialReadableStream(body);
            return next();
          } else {
            const errMsg = `[Fault Injection] Response body not available to inject ${injectTypeStr}`;
            this.logger.info(errMsg);
            return next(new Error(errMsg));
          }
        } else if (
          position === "afterSerializer" &&
          injectTypeStr === "partialResponseThenTimeout"
        ) {
          // Do nothing, leaving the socket open but never sending a response.
          return;
        }
        break;
      }
      default:
        const errMsg = `Unsupported fault injection type: ${injectTypeStr}.`;
        this.logger.info(errMsg);
        return next(new Error(errMsg));
    }
  }
}
