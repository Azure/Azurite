import MiddlewareError from "../../blob/generated/errors/MiddlewareError";
import { jsonToXML } from "../../blob/generated/utils/xml";
import Context from "../../blob/generated/Context";
import { isDataLakeOperation } from "../utils/utils";

/**
 * Represents an Azure Storage Server Error.
 *
 * @export
 * @class StorageError
 * @extends {MiddlewareError}
 */
export default class DataLakeError extends MiddlewareError {
  public readonly errorCode: string;
  public readonly errorMessage: string;
  public readonly storageRequestID: string | undefined;

  /**isDataLakeOperation(context.context.dfsOperation!);
   * Creates an instance of StorageError.
   *
   * @param {number} statusCode HTTP response status code
   * @param {string} dataLakeErrorCode Azure DataLake error code, will be in response body and header
   * @param {string} dataLakeErrorMessage Azure DataLake error message
   * @param {string} blobErrorCode Azure Storage error code, will be in response body and header
   * @param {string} blobErrorMessage Azure Storage error message
   * @param {string} context The request Context
   * @param {{ [key: string]: string }} [storageAdditionalErrorMessages={}]
   *                                  Additional error messages will be included in XML body
   * @memberof StorageError
   */
  constructor(
    statusCode: number,
    dataLakeErrorCode: string,
    dataLakeErrorMessage: string,
    blobErrorCode: string,
    blobErrorMessage: string,
    context: Context,
    storageAdditionalErrorMessages: { [key: string]: string } = {}
  ) {
    const isDataLake = isDataLakeOperation(context);
    const code = isDataLake ? dataLakeErrorCode : blobErrorCode;
    const message = isDataLake ? dataLakeErrorMessage : blobErrorMessage;
    const storageRequestID = context.contextId;

    let bodyInJSON: any = {
      code,
      message: `${message}\nRequestId:${storageRequestID}\nTime:${new Date().toISOString()}`
    };

    for (const key in storageAdditionalErrorMessages) {
      if (storageAdditionalErrorMessages.hasOwnProperty(key)) {
        const element = storageAdditionalErrorMessages[key];
        bodyInJSON[key] = element;
      }
    }

    bodyInJSON = {
      message: `${message}\nRequestId:${storageRequestID}\nTime:${new Date().toISOString()}`,
      code,
      errorCode: code,
      error: bodyInJSON
    };

    for (const key in storageAdditionalErrorMessages) {
      if (storageAdditionalErrorMessages.hasOwnProperty(key)) {
        const element = storageAdditionalErrorMessages[key];
        bodyInJSON[key] = element;
      }
    }

    const bodyInXML = jsonToXML(bodyInJSON);

    super(
      statusCode,
      message,
      code,
      {
        "x-ms-error-code": dataLakeErrorCode,
        "x-ms-request-id": storageRequestID
      },
      // bodyInJSON,
      // "application/json"
      bodyInXML,
      "application/xml"
    );

    this.name = "StorageError";
    this.errorCode = code;
    this.errorMessage = message;
    this.storageRequestID = storageRequestID;
  }
}
