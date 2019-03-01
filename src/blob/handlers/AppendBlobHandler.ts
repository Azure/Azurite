import NotImplementedError from "../errors/NotImplementedError";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IAppendBlobHandler from "../generated/handlers/IAppendBlobHandler";
import BaseHandler from "./BaseHandler";

export default class AppendBlobHandler extends BaseHandler
  implements IAppendBlobHandler {
  public create(
    contentLength: number,
    options: Models.AppendBlobCreateOptionalParams,
    context: Context
  ): Promise<Models.AppendBlobCreateResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public appendBlock(
    body: NodeJS.ReadableStream,
    contentLength: number,
    options: Models.AppendBlobAppendBlockOptionalParams,
    context: Context
  ): Promise<Models.AppendBlobAppendBlockResponse> {
    throw new NotImplementedError(context.contextID);
  }
}
