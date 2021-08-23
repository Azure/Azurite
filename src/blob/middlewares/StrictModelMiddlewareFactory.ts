import { NextFunction, Request, RequestHandler, Response } from "express";

import ILogger from "../../common/ILogger";
import BlobStorageContext from "../context/BlobStorageContext";
import StrictModelNotSupportedError from "../errors/StrictModelNotSupportedError";
import Context from "../generated/Context";
import ExpressRequestAdapter from "../generated/ExpressRequestAdapter";
import IRequest from "../generated/IRequest";
import { DEFAULT_CONTEXT_PATH, HeaderConstants } from "../utils/constants";

export type StrictModelRequestValidator = (
  req: IRequest,
  context: Context,
  logger: ILogger
) => Promise<void>;

export const UnsupportedHeadersBlocker: StrictModelRequestValidator = async (
  req: IRequest,
  context: Context,
  logger: ILogger
): Promise<void> => {
  const UnsupportedHeaderKeys = [
    HeaderConstants.X_MS_CONTENT_CRC64,
    HeaderConstants.X_MS_RANGE_GET_CONTENT_CRC64,
    HeaderConstants.X_MS_ENCRYPTION_KEY,
    HeaderConstants.X_MS_ENCRYPTION_KEY_SHA256,
    HeaderConstants.X_MS_ENCRYPTION_ALGORITHM
  ];

  for (const headerKey of UnsupportedHeaderKeys) {
    const value = req.getHeader(headerKey);
    if (typeof value === "string") {
      throw new StrictModelNotSupportedError(headerKey, context.contextId);
    }
  }
};

export const UnsupportedParametersBlocker: StrictModelRequestValidator = async (
  req: IRequest,
  context: Context,
  logger: ILogger
): Promise<void> => {
  const UnsupportedParameterKeys: string[] = [
  ];

  for (const parameterKey of UnsupportedParameterKeys) {
    const value = req.getQuery(parameterKey);
    if (typeof value === "string") {
      throw new StrictModelNotSupportedError(parameterKey, context.contextId);
    }
  }
};

export default class StrictModelMiddlewareFactory {
  constructor(
    private readonly logger: ILogger,
    private readonly validators: StrictModelRequestValidator[]
  ) {}

  public createStrictModelMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      this.validate(req, res)
        .then(next)
        .catch(next);
    };
  }

  private async validate(req: Request, res: Response): Promise<void> {
    const context = new BlobStorageContext(res.locals, DEFAULT_CONTEXT_PATH);
    for (const validator of this.validators) {
      await validator(new ExpressRequestAdapter(req), context, this.logger);
    }
  }
}
