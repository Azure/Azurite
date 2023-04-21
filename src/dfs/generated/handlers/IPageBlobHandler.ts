/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 *
 * Code generated by Microsoft (R) AutoRest Code Generator.
 * Changes may cause incorrect behavior and will be lost if the code is
 * regenerated.
 */
// tslint:disable:max-line-length

import * as Models from "../artifacts/models";
import Context from "../../../blob/generated/Context";

export default interface IPageBlobHandler {
  create(contentLength: number, blobContentLength: number, options: Models.PageBlobCreateOptionalParams, context: Context): Promise<Models.PageBlobCreateResponse>;
  uploadPages(body: NodeJS.ReadableStream, contentLength: number, options: Models.PageBlobUploadPagesOptionalParams, context: Context): Promise<Models.PageBlobUploadPagesResponse>;
  clearPages(contentLength: number, options: Models.PageBlobClearPagesOptionalParams, context: Context): Promise<Models.PageBlobClearPagesResponse>;
  uploadPagesFromURL(sourceUrl: string, sourceRange: string, contentLength: number, range: string, options: Models.PageBlobUploadPagesFromURLOptionalParams, context: Context): Promise<Models.PageBlobUploadPagesFromURLResponse>;
  getPageRanges(options: Models.PageBlobGetPageRangesOptionalParams, context: Context): Promise<Models.PageBlobGetPageRangesResponse>;
  getPageRangesDiff(options: Models.PageBlobGetPageRangesDiffOptionalParams, context: Context): Promise<Models.PageBlobGetPageRangesDiffResponse>;
  resize(blobContentLength: number, options: Models.PageBlobResizeOptionalParams, context: Context): Promise<Models.PageBlobResizeResponse>;
  updateSequenceNumber(sequenceNumberAction: Models.SequenceNumberActionType, options: Models.PageBlobUpdateSequenceNumberOptionalParams, context: Context): Promise<Models.PageBlobUpdateSequenceNumberResponse>;
  copyIncremental(copySource: string, options: Models.PageBlobCopyIncrementalOptionalParams, context: Context): Promise<Models.PageBlobCopyIncrementalResponse>;
}
