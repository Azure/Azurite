import NotImplementedError from "../errors/NotImplementedError";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IPageBlobHandler from "../generated/handlers/IPageBlobHandler";
import BaseHandler from "./BaseHandler";

export default class PageBlobHandler extends BaseHandler
  implements IPageBlobHandler {
  public create(
    contentLength: number,
    blobContentLength: number,
    options: Models.PageBlobCreateOptionalParams,
    context: Context
  ): Promise<Models.PageBlobCreateResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public uploadPages(
    body: NodeJS.ReadableStream,
    contentLength: number,
    options: Models.PageBlobUploadPagesOptionalParams,
    context: Context
  ): Promise<Models.PageBlobUploadPagesResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public clearPages(
    contentLength: number,
    options: Models.PageBlobClearPagesOptionalParams,
    context: Context
  ): Promise<Models.PageBlobClearPagesResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public getPageRanges(
    options: Models.PageBlobGetPageRangesOptionalParams,
    context: Context
  ): Promise<Models.PageBlobGetPageRangesResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public getPageRangesDiff(
    options: Models.PageBlobGetPageRangesDiffOptionalParams,
    context: Context
  ): Promise<Models.PageBlobGetPageRangesDiffResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public resize(
    blobContentLength: number,
    options: Models.PageBlobResizeOptionalParams,
    context: Context
  ): Promise<Models.PageBlobResizeResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public updateSequenceNumber(
    sequenceNumberAction: Models.SequenceNumberActionType,
    options: Models.PageBlobUpdateSequenceNumberOptionalParams,
    context: Context
  ): Promise<Models.PageBlobUpdateSequenceNumberResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public copyIncremental(
    copySource: string,
    options: Models.PageBlobCopyIncrementalOptionalParams,
    context: Context
  ): Promise<Models.PageBlobCopyIncrementalResponse> {
    throw new NotImplementedError(context.contextID);
  }
}
