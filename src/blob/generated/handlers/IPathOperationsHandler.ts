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
import Context from "../Context";

export default interface IPathOperationsHandler {
  create(options: Models.PathCreateOptionalParams, context: Context): Promise<Models.PathCreateResponse>;
  update(action: Models.PathUpdateAction, mode: Models.PathSetAccessControlRecursiveMode, body: NodeJS.ReadableStream, options: Models.PathUpdateOptionalParams, context: Context): Promise<Models.PathUpdateResponse>;
  lease(xMsLeaseAction: Models.PathLeaseAction, options: Models.PathLeaseOptionalParams, context: Context): Promise<Models.PathLeaseResponse>;
  read(options: Models.PathReadOptionalParams, context: Context): Promise<Models.PathReadResponse>;
  getProperties(options: Models.PathGetPropertiesOptionalParams, context: Context): Promise<Models.PathGetPropertiesResponse>;
  delete(options: Models.PathDeleteMethodOptionalParams, context: Context): Promise<Models.PathDeleteResponse>;
  setAccessControl(options: Models.PathSetAccessControlOptionalParams, context: Context): Promise<Models.PathSetAccessControlResponse>;
  setAccessControlRecursive(mode: Models.PathSetAccessControlRecursiveMode, options: Models.PathSetAccessControlRecursiveOptionalParams, context: Context): Promise<Models.PathSetAccessControlRecursiveResponse>;
  flushData(options: Models.PathFlushDataOptionalParams, context: Context): Promise<Models.PathFlushDataResponse>;
  appendData(body: NodeJS.ReadableStream, options: Models.PathAppendDataOptionalParams, context: Context): Promise<Models.PathAppendDataResponse>;
  setExpiry(expiryOptions: Models.PathExpiryOptions, options: Models.PathSetExpiryOptionalParams, context: Context): Promise<Models.PathSetExpiryResponse>;
  undelete(options: Models.PathUndeleteOptionalParams, context: Context): Promise<Models.PathUndeleteResponse>;
}
