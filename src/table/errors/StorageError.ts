import {
  FULL_METADATA_ACCEPT,
  MINIMAL_METADATA_ACCEPT,
  NO_METADATA_ACCEPT,
  TABLE_API_VERSION
} from "../../table/utils/constants";
import Context from "../generated/Context";
import MiddlewareError from "../generated/errors/MiddlewareError";
import { jsonToXML } from "../generated/utils/xml";
import { getPayloadFormat } from "../utils/utils";

/**
 * Represents an Azure Storage Server Error.
 *
 * @export
 * @class StorageError
 * @extends {MiddlewareError}
 */
export default class StorageError extends MiddlewareError {
  public readonly storageErrorCode: string;
  public readonly storageErrorMessage: string;
  public readonly storageRequestID: string;

  /**
   * Creates an instance of StorageError.
   *
   * @param {number} statusCode HTTP response status code
   * @param {string} storageErrorCode Azure Storage error code, will be in response body and header
   * @param {string} storageErrorMessage Azure Storage error message
   * @param {string} storageRequestID Azure Storage server request ID
   * @param {{ [key: string]: string }} [storageAdditionalErrorMessages={}]
   *                                  Additional error messages will be included in XML body
   * @param [Context] context
   * @memberof StorageError
   */
  constructor(
    statusCode: number,
    storageErrorCode: string,
    storageErrorMessage: string,
    storageRequestID: string,
    storageAdditionalErrorMessages: { [key: string]: string } = {},
    context: Context
  ) {
    const payload = getPayloadFormat(context);
    const isJSON =
      payload === NO_METADATA_ACCEPT ||
      payload === MINIMAL_METADATA_ACCEPT ||
      payload === FULL_METADATA_ACCEPT;

    const bodyInJSON: any = isJSON
      ? {
          code: storageErrorCode,
          message: {
            lang: "en-US",
            value: `${storageErrorMessage}\nRequestId:${storageRequestID}\nTime:${new Date().toISOString()}`
          }
        }
      : {
          Code: storageErrorCode,
          Message: `${storageErrorMessage}\nRequestId:${storageRequestID}\nTime:${new Date().toISOString()}`
        };

    for (const key in storageAdditionalErrorMessages) {
      if (storageAdditionalErrorMessages.hasOwnProperty(key)) {
        const element = storageAdditionalErrorMessages[key];
        bodyInJSON[key] = element;
      }
    }

    const body = isJSON
      ? JSON.stringify({ "odata.error": bodyInJSON })
      : jsonToXML({ Error: bodyInJSON });

    super(
      statusCode,
      storageErrorMessage,
      undefined,
      {
        "x-ms-error-code": storageErrorCode,
        "x-ms-request-id": storageRequestID,
        "x-ms-version": TABLE_API_VERSION
      },
      body,
      isJSON ? `${payload};streaming=true;charset=utf-8` : "application/xml"
    );

    this.name = "StorageError";
    this.storageErrorCode = storageErrorCode;
    this.storageErrorMessage = storageErrorMessage;
    this.storageRequestID = storageRequestID;
  }
}
