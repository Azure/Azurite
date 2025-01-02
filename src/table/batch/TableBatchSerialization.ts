// import BatchOperation from "../../common/BatchOperation";
// import { BatchOperationType } from "../../common/BatchOperation";
import "./BatchOperation";
import BatchRequest from "./BatchRequest";
// import BatchSubResponse from "../../common/BatchSubResponse";

import { HttpMethod } from "../../table/generated/IRequest";
import { BatchSerialization } from "./BatchSerialization";
import TableBatchOperation from "../batch/TableBatchOperation";
import * as Models from "../generated/artifacts/models";
import TableBatchUtils from "./TableBatchUtils";
import StorageError from "../errors/StorageError";
import { truncatedISO8061Date } from "../../common/utils/utils";

/**
 * The semantics for entity group transactions are defined by the OData Protocol Specification.
 * https://www.odata.org/
 * http://docs.oasis-open.org/odata/odata-json-format/v4.01/odata-json-format-v4.01.html#_Toc38457781
 *
 * for now we are first getting the concrete implementation correct for table batch
 * we then need to figure out how to do this for blob, and what can be shared.
 * We set several headers in the responses to the same values that we see returned
 * from the Azure Storage Service.
 *
 * @export
 * @class TableBatchSerialization
 * @extends {BatchSerialization}
 */
export class TableBatchSerialization extends BatchSerialization {
  /**
   * Deserializes a batch request
   *
   * @param {string} batchRequestsString
   * @return {*}  {TableBatchOperation[]}
   * @memberof TableBatchSerialization
   */
  public deserializeBatchRequest(
    batchRequestsString: string
  ): TableBatchOperation[] {
    this.extractBatchBoundary(batchRequestsString);
    this.extractChangeSetBoundary(batchRequestsString);
    this.extractLineEndings(batchRequestsString);

    // the line endings might be \r\n or \n
    const HTTP_LINE_ENDING = this.lineEnding;
    const subRequestPrefix = `--${this.changesetBoundary}${HTTP_LINE_ENDING}`;
    const splitBody = batchRequestsString.split(subRequestPrefix);

    // dropping first element as boundary if we have a batch with multiple requests
    let subRequests: string[];
    if (splitBody.length > 1) {
      subRequests = splitBody.slice(1, splitBody.length);
    } else {
      subRequests = splitBody;
    }

    // This goes through each operation in the request and maps the content
    // of the request by deserializing it into a BatchOperation Type
    const batchOperations: TableBatchOperation[] = subRequests.map(
      (subRequest) => {
        let requestType: RegExpMatchArray | null = subRequest.match(
          "(GET|PATCH|POST|PUT|MERGE|INSERT|DELETE)"
        );
        if (requestType === null || requestType.length < 2) {
          throw new Error(
            `Couldn't extract verb from sub-Request:\n ${subRequest}`
          );
        }

        const fullRequestURI = subRequest.match(/((http+s?)(\S)+)/);
        if (fullRequestURI === null || fullRequestURI.length < 3) {
          throw new Error(
            `Couldn't extract full request URL from sub-Request:\n ${subRequest}`
          );
        }

        // extract the request path
        const path = this.extractPath(fullRequestURI[1]);
        if (path === null || path.length < 2) {
          throw new Error(
            `Couldn't extract path from URL in sub-Request:\n ${subRequest}`
          );
        }

        const jsonOperationBody = subRequest.match(/{+.+}+/);

        // Delete does not use a JSON body, but the COSMOS Table client also
        // submits requests without a JSON body for merge
        if (
          subRequests.length > 1 &&
          null !== requestType &&
          requestType[0] !== "DELETE" &&
          requestType[0] !== "MERGE" &&
          (jsonOperationBody === null || jsonOperationBody.length < 1)
        ) {
          throw new Error(
            `Couldn't extract path from sub-Request:\n ${subRequest}`
          );
        }

        let headers: string;
        let jsonBody: string;
        let subStringStart: number;
        let subStringEnd: number;
        // currently getting an invalid header in the first position
        // during table entity test for insert & merge
        subStringStart = subRequest.indexOf(fullRequestURI[1]);
        subStringStart += fullRequestURI[1].length + 1; // for the space

        if (jsonOperationBody != null) {
          // we need the jsonBody and request path extracted to be able to extract headers.
          subStringEnd = subRequest.indexOf(jsonOperationBody[0]);
          jsonBody = jsonOperationBody[0];
        } else {
          // trim "\r\n\r\n" or "\n\n" from subRequest
          subStringEnd = subRequest.length - HTTP_LINE_ENDING.length * 2;
          jsonBody = "";
        }

        headers = subRequest.substring(subStringStart, subStringEnd);

        const operation = new TableBatchOperation(headers);
        if (null !== requestType) {
          operation.httpMethod = requestType[0] as HttpMethod;
        }
        operation.path = path[1];
        operation.uri = fullRequestURI[0];
        operation.jsonRequestBody = jsonBody;
        return operation;
      }
    );

    return batchOperations;
  }

  /**
   * Serializes an Insert entity response
   *
   * @param {BatchRequest} request
   * @param {Models.TableInsertEntityResponse} response
   * @return {*}  {string}
   * @memberof TableBatchSerialization
   */
  public serializeTableInsertEntityBatchResponse(
    request: BatchRequest,
    response: Models.TableInsertEntityResponse
  ): string {
    let serializedResponses: string = "";
    serializedResponses = this.SetContentTypeAndEncoding(serializedResponses);
    serializedResponses = this.serializeHttpStatusCode(
      serializedResponses,
      response.statusCode
    );
    // ToDo: Correct the handling of Content-ID
    if (request.contentID !== undefined) {
      serializedResponses +=
        "Content-ID: " + request.contentID.toString() + "\r\n";
    }

    serializedResponses = this.SerializeNoSniffNoCache(serializedResponses);

    serializedResponses = this.serializePreferenceApplied(
      request,
      serializedResponses
    );

    serializedResponses = this.serializeDataServiceVersion(
      serializedResponses,
      request
    );

    serializedResponses +=
      "Location: " + this.SerializeEntityPath(serializedResponses, request);
    serializedResponses +=
      "DataServiceId: " +
      this.SerializeEntityPath(serializedResponses, request);

    if (null !== response.eTag && undefined !== response.eTag) {
      serializedResponses += "ETag: " + response.eTag + "\r\n";
    }
    return serializedResponses;
  }

  /**
   * creates the serialized entitygrouptransaction / batch response body
   * which we return to the users batch request
   *
   * @param {BatchRequest} request
   * @param {Models.TableDeleteEntityResponse} response
   * @return {*}  {string}
   * @memberof TableBatchSerialization
   */
  public serializeTableDeleteEntityBatchResponse(
    request: BatchRequest,
    response: Models.TableDeleteEntityResponse
  ): string {
    // ToDo: keeping my life easy to start and defaulting to "return no content"
    let serializedResponses: string = "";
    // create the initial boundary
    serializedResponses = this.SetContentTypeAndEncoding(serializedResponses);
    serializedResponses = this.serializeHttpStatusCode(
      serializedResponses,
      response.statusCode
    );

    serializedResponses = this.SerializeNoSniffNoCache(serializedResponses);
    serializedResponses = this.serializeDataServiceVersion(
      serializedResponses,
      request,
      true
    );

    return serializedResponses;
  }

  /**
   * Serializes the Update Entity Batch Response
   *
   * @param {BatchRequest} request
   * @param {Models.TableUpdateEntityResponse} response
   * @return {*}  {string}
   * @memberof TableBatchSerialization
   */
  public serializeTableUpdateEntityBatchResponse(
    request: BatchRequest,
    response: Models.TableUpdateEntityResponse
  ): string {
    let serializedResponses: string = "";
    // create the initial boundary
    serializedResponses = this.SetContentTypeAndEncoding(serializedResponses);
    serializedResponses = this.serializeHttpStatusCode(
      serializedResponses,
      response.statusCode
    );
    // ToDo_: Correct the handling of content-ID
    if (request.contentID) {
      serializedResponses +=
        "Content-ID: " + request.contentID.toString() + "\r\n";
    }

    serializedResponses = this.SerializeNoSniffNoCache(serializedResponses);

    serializedResponses = this.serializePreferenceApplied(
      request,
      serializedResponses
    );

    serializedResponses = this.serializeDataServiceVersion(
      serializedResponses,
      request
    );

    if (null !== response.eTag && undefined !== response.eTag) {
      serializedResponses += "ETag: " + response.eTag + "\r\n";
    }
    return serializedResponses;
  }

  /**
   * Serializes the preference applied header
   *
   * @private
   * @param {BatchRequest} request
   * @param {string} serializedResponses
   * @return {*}
   * @memberof TableBatchSerialization
   */
  private serializePreferenceApplied(
    request: BatchRequest,
    serializedResponses: string
  ) {
    if (request.getHeader("Preference-Applied")) {
      serializedResponses +=
        "Preference-Applied: " +
        request.getHeader("Preference-Applied") +
        "\r\n";
    }
    return serializedResponses;
  }

  /**
   * Serializes the Merge Entity Response
   *
   * @param {BatchRequest} request
   * @param {Models.TableMergeEntityResponse} response
   * @return {*}  {string}
   * @memberof TableBatchSerialization
   */
  public serializeTableMergeEntityBatchResponse(
    request: BatchRequest,
    response: Models.TableMergeEntityResponse
  ): string {
    let serializedResponses: string = "";
    serializedResponses = this.SetContentTypeAndEncoding(serializedResponses);
    serializedResponses = this.serializeHttpStatusCode(
      serializedResponses,
      response.statusCode
    );
    serializedResponses = this.SerializeNoSniffNoCache(serializedResponses);
    // ToDo_: Correct the handling of content-ID
    if (request.contentID) {
      serializedResponses +=
        "Content-ID: " + request.contentID.toString() + "\r\n";
    }
    // ToDo: not sure about other headers like cache control etc right now
    // Service defaults to v1.0
    serializedResponses = this.serializeDataServiceVersion(
      serializedResponses,
      request
    );

    if (null !== response.eTag && undefined !== response.eTag) {
      serializedResponses += "ETag: " + response.eTag + "\r\n";
    }
    return serializedResponses;
  }

  /**
   * Serializes the Query Entity Response when using Partition and Row Key
   *
   * @param {BatchRequest} request
   * @param {Models.TableQueryEntitiesWithPartitionAndRowKeyResponse} response
   * @return {*}  {Promise<string>}
   * @memberof TableBatchSerialization
   */
  public async serializeTableQueryEntityWithPartitionAndRowKeyBatchResponse(
    request: BatchRequest,
    response: Models.TableQueryEntitiesWithPartitionAndRowKeyResponse
  ): Promise<string> {
    let serializedResponses: string = "";
    // create the initial boundary
    serializedResponses = this.SetContentTypeAndEncoding(serializedResponses);
    serializedResponses = this.serializeHttpStatusCode(
      serializedResponses,
      response.statusCode
    );

    serializedResponses = this.serializeDataServiceVersion(
      serializedResponses,
      request
    );

    serializedResponses += "Content-Type: ";
    serializedResponses += request.params.queryOptions?.format;
    serializedResponses += ";streaming=true;charset=utf-8\r\n"; // getting this from service, so adding here as well

    serializedResponses = this.SerializeNoSniffNoCache(serializedResponses);

    if (response.eTag) {
      serializedResponses += "ETag: " + response.eTag;
    }
    serializedResponses += "\r\n";

    // now we need to return the JSON body
    // ToDo: I don't like the stream to string to stream conversion here...
    // just not sure there is any way around it
    if (response.body != null) {
      try {
        serializedResponses += await TableBatchUtils.StreamToString(
          response.body
        );
      } catch {
        // do nothing
        throw new Error("failed to deserialize body");
      }
    }
    serializedResponses += "\r\n";
    return serializedResponses;
  }

  /**
   * Serializes query entity response
   *
   * @param {BatchRequest} request
   * @param {Models.TableQueryEntitiesResponse} response
   * @return {*}  {Promise<string>}
   * @memberof TableBatchSerialization
   */
  public async serializeTableQueryEntityBatchResponse(
    request: BatchRequest,
    response: Models.TableQueryEntitiesResponse
  ): Promise<string> {
    let serializedResponses: string = "";
    serializedResponses = this.SetContentTypeAndEncoding(serializedResponses);
    serializedResponses = this.serializeHttpStatusCode(
      serializedResponses,
      response.statusCode
    );

    serializedResponses = this.serializeDataServiceVersion(
      serializedResponses,
      request
    );

    serializedResponses += "Content-Type: ";
    serializedResponses += request.params.queryOptions?.format;
    serializedResponses += ";streaming=true;charset=utf-8\r\n"; // getting this from service, so adding as well

    // Azure Table service defaults to this in the response
    // X-Content-Type-Options: nosniff\r\n
    serializedResponses = this.SerializeNoSniffNoCache(serializedResponses);

    serializedResponses += "\r\n";

    // now we need to return the JSON body
    // ToDo: I don't like the stream to string to stream conversion here...
    // just not sure there is any way around it
    if (response.body != null) {
      try {
        serializedResponses += await TableBatchUtils.StreamToString(
          response.body
        );
      } catch {
        // Throw a more helpful error
        throw new Error("failed to deserialize body");
      }
    }
    serializedResponses += "\r\n";
    return serializedResponses;
  }

  /**
   * Serializes content type and encoding
   *
   * @private
   * @param {string} serializedResponses
   * @return {*}
   * @memberof TableBatchSerialization
   */
  private SetContentTypeAndEncoding(serializedResponses: string) {
    serializedResponses += "\r\nContent-Type: application/http\r\n";
    serializedResponses += "Content-Transfer-Encoding: binary\r\n";
    serializedResponses += "\r\n";
    return serializedResponses;
  }

  /**
   * Serializes Content Type Options and Cache Control
   * THese seem to be service defaults
   *
   * @private
   * @param {string} serializedResponses
   * @return {*}
   * @memberof TableBatchSerialization
   */
  private SerializeNoSniffNoCache(serializedResponses: string) {
    serializedResponses =
      this.SerializeXContentTypeOptions(serializedResponses);
    serializedResponses += "Cache-Control: no-cache\r\n";
    return serializedResponses;
  }

  private SerializeXContentTypeOptions(serializedResponses: string) {
    serializedResponses += "X-Content-Type-Options: nosniff\r\n";
    return serializedResponses;
  }
  /**
   * Serializes the HTTP response
   * ToDo: Need to check where we have implemented this elsewhere and see if we can reuse
   *
   * @private
   * @param {number} statusCode
   * @return {*}  {string}
   * @memberof TableBatchSerialization
   */
  private GetStatusMessageString(statusCode: number): string {
    switch (statusCode) {
      case 200:
        return "OK";
      case 201:
        return "Created";
      case 204:
        return "No Content";
      case 404:
        return "Not Found";
      case 400:
        return "Bad Request";
      case 409:
        return "Conflict";
      case 412:
        return "Precondition Failed";
      default:
        return "STATUS_CODE_NOT_IMPLEMENTED";
    }
  }

  /**
   * Serialize HTTP Status Code
   *
   * @private
   * @param {string} serializedResponses
   * @param {*} response
   * @return {*}
   * @memberof TableBatchSerialization
   */
  private serializeHttpStatusCode(
    serializedResponses: string,
    statusCode: number
  ) {
    serializedResponses +=
      "HTTP/1.1 " +
      statusCode.toString() +
      " " +
      this.GetStatusMessageString(statusCode) +
      "\r\n";
    return serializedResponses;
  }

  /**
   * Serializes the Location and DataServiceId for the response
   * These 2 headers should point to the result of the successful insert
   * https://docs.microsoft.com/de-de/dotnet/api/microsoft.azure.batch.addtaskresult.location?view=azure-dotnet#Microsoft_Azure_Batch_AddTaskResult_Location
   * https://docs.microsoft.com/de-de/dotnet/api/microsoft.azure.batch.protocol.models.taskgetheaders.dataserviceid?view=azure-dotnet
   * i.e. Location: http://127.0.0.1:10002/devstoreaccount1/SampleHubVSHistory(PartitionKey='7219c1f2e2674f249bf9589d31ab3c6e',RowKey='sentinel')
   *
   * @private
   * @param {string} serializedResponses
   * @param {BatchRequest} request
   * @return {string}
   * @memberof TableBatchSerialization
   */
  private SerializeEntityPath(
    serializedResponses: string,
    request: BatchRequest
  ): string {
    const parenthesesPosition: number = request.getUrl().indexOf("(");
    const queryPosition: number = request.getUrl().indexOf("?");
    let offsetPosition: number = -1;
    if (
      queryPosition > 0 &&
      (queryPosition < parenthesesPosition || parenthesesPosition === -1)
    ) {
      offsetPosition = queryPosition;
    } else {
      offsetPosition = parenthesesPosition;
    }
    offsetPosition--;
    if (offsetPosition < 0) {
      offsetPosition = request.getUrl().length;
    }
    const trimmedUrl: string = request.getUrl().substring(0, offsetPosition);
    let entityPath = trimmedUrl + "(PartitionKey='";
    entityPath += encodeURIComponent(
      request.params.tableEntityProperties!.PartitionKey
    );
    entityPath += "',";
    entityPath += "RowKey='";
    entityPath += encodeURIComponent(
      request.params.tableEntityProperties!.RowKey
    );
    entityPath += "')\r\n";
    return entityPath;
  }

  /**
   * serializes data service version
   *
   * @private
   * @param {BatchRequest} request
   * @param {string} serializedResponses
   * @return {*}
   * @memberof TableBatchSerialization
   */
  private serializeDataServiceVersion(
    serializedResponses: string,
    request: BatchRequest | undefined,
    forceDataServiceVersion1: boolean = false
  ) {
    if (
      undefined !== request &&
      undefined !== request.params &&
      request.params.dataServiceVersion &&
      forceDataServiceVersion1 === false
    ) {
      serializedResponses +=
        "DataServiceVersion: " + request.params.dataServiceVersion + ";\r\n";
    } else if (forceDataServiceVersion1) {
      // defaults to 3.0 unless we force to 1 (as seen in service tests)
      serializedResponses += "DataServiceVersion: 1.0;\r\n";
    } else {
      serializedResponses += "DataServiceVersion: 3.0;\r\n";
    }
    // note that we remove the extra CRLF at the end of this header response!
    return serializedResponses;
  }

  /**
   * Serializes an error generated during batch processing
   * https://docs.microsoft.com/en-us/rest/api/storageservices/performing-entity-group-transactions#sample-error-response
   * @private
   * @param {*} err
   * @return {*}  {string}
   * @memberof TableBatchSerialization
   */
  public serializeError(
    err: any,
    contentID: number,
    request: BatchRequest
  ): string {
    let errorResponse = "";
    const odataError = err as StorageError;
    // Errors in batch processing generate Bad Request error
    errorResponse = this.serializeHttpStatusCode(errorResponse, err.statusCode);
    errorResponse += "Content-ID: " + contentID + "\r\n";
    errorResponse = this.serializeDataServiceVersion(errorResponse, request);
    // ToDo: Check if we need to observe other odata formats for errors
    errorResponse +=
      "Content-Type: application/json;odata=minimalmetadata;charset=utf-8\r\n";
    errorResponse += "\r\n";
    // the odata error needs to include the index of the operation that fails
    // see sample from:
    // https://docs.microsoft.com/en-us/rest/api/storageservices/performing-entity-group-transactions#sample-error-response
    // In this case, we need to use a 0 based index for the failing operation
    errorResponse +=
      odataError.body?.replace('"value":"', `\"value\":\"${contentID - 1}:`) +
      "\r\n";
    return errorResponse;
  }

  /**
   * Serializes top level errors not generated from individual request processing
   *
   * @param {string} odataErrorString
   * @param {(string | undefined)} requestId
   * @return {*}  {string}
   * @memberof TableBatchSerialization
   */
  public serializeGeneralRequestError(
    odataErrorString: string,
    requestId: string | undefined
  ): string {
    const changesetBoundary = this.changesetBoundary.replace(
      "changeset",
      "changesetresponse"
    );
    let errorResponse = "";

    errorResponse += changesetBoundary + "\r\n";
    // Errors in batch processing generate Bad Request error
    errorResponse = this.serializeHttpStatusCode(errorResponse, 400);
    errorResponse = this.SerializeXContentTypeOptions(errorResponse);
    errorResponse = this.serializeDataServiceVersion(errorResponse, undefined);
    // ToDo: Serialize Content type etc
    errorResponse +=
      "Content-Type: application/json;odata=minimalmetadata;charset=utf-8\r\n";
    errorResponse += "\r\n";
    let requestIdResponseString = "";
    if (requestId !== undefined) {
      requestIdResponseString = `RequestId:${requestId}\\n`;
    }
    // 2021-04-23T12:40:31.4944778
    const date = truncatedISO8061Date(new Date(), true);
    errorResponse += `{\"odata.error\":{\"code\":\"InvalidInput\",\"message\":{\"lang\":\"en-US\",\"value\":\"${odataErrorString}\\n${requestIdResponseString}Time:${date}\"}}}\r\n`;
    return errorResponse;
  }
}
