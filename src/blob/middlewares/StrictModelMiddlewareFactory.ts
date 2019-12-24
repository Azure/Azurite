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
    HeaderConstants.IF_MATCH,
    HeaderConstants.IF_NONE_MATCH,
    HeaderConstants.IF_MODIFIED_SINCE,
    HeaderConstants.IF_UNMODIFIED_SINCE,
    HeaderConstants.SOURCE_IF_MATCH,
    HeaderConstants.SOURCE_IF_MODIFIED_SINCE,
    HeaderConstants.SOURCE_IF_NONE_MATCH,
    HeaderConstants.SOURCE_IF_UNMODIFIED_SINCE,
    HeaderConstants.X_MS_IF_SEQUENCE_NUMBER_LE,
    HeaderConstants.X_MS_IF_SEQUENCE_NUMBER_LT,
    HeaderConstants.X_MS_IF_SEQUENCE_NUMBER_EQ,
    HeaderConstants.X_MS_BLOB_CONDITION_MAXSIZE,
    HeaderConstants.X_MS_BLOB_CONDITION_APPENDPOS
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
  const UnsupportedParameterKeys = [
    // https://docs.microsoft.com/en-us/rest/api/storageservices/create-service-sas#specifying-query-parameters-to-override-response-headers-blob-and-file-services-only
    "rscc",
    "rscc",
    "rsce",
    "rsce",
    "rsct"
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
