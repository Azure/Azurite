// import BatchOperation from "../../common/BatchOperation";
// import { BatchOperationType } from "../../common/BatchOperation";
import { BatchType } from "../../common/batch/BatchOperation";
import BatchRequest from "../../common/batch/BatchRequest";
// import BatchSubResponse from "../../common/BatchSubResponse";

import { HttpMethod } from "../../table/generated/IRequest";
import { BatchSerialization } from "../../common/batch/BatchSerialization";
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
    // we can't rely on case of strings we use in delimiters
    // ToDo: might be easier and more efficient to use i option on the regex here...
    const contentTypeHeaderString = this.extractRequestHeaderString(
      batchRequestsString,
      "(\\n)+(([c,C])+(ontent-)+([t,T])+(ype)+)+(?=:)+"
    );
    const contentTransferEncodingString = this.extractRequestHeaderString(
      batchRequestsString,
      "(\\n)+(([c,C])+(ontent-)+([t,T])+(ransfer-)+([e,E])+(ncoding))+(?=:)+"
    );

    // the line endings might be \r\n or \n
    const HTTP_LINE_ENDING = this.lineEnding;
    const subRequestPrefix = `--${this.changesetBoundary}${HTTP_LINE_ENDING}${contentTypeHeaderString}: application/http${HTTP_LINE_ENDING}${contentTransferEncodingString}: binary`;
    const splitBody = batchRequestsString.split(subRequestPrefix);

    // dropping first element as boundary if we have a batch with multiple requests
    let subRequests: string[];
    if (splitBody.length > 1) {
      subRequests = splitBody.slice(1, splitBody.length);
    } else {
      subRequests = splitBody;
    }

    // This goes through each operation in the the request and maps the content
    // of the request by deserializing it into a BatchOperation Type
    const batchOperations: TableBatchOperation[] = subRequests.map(
      (subRequest) => {
        let requestType: RegExpMatchArray | null = [];
        requestType = subRequest.match(
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

        // ToDo: not sure if this logic is valid, it might be better
        // to just have an empty body and then error out when determining routing of request in Handler
        if (
          subRequests.length > 1 &&
          null !== requestType &&
          requestType[0] !== "DELETE" &&
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
          // remove 1 \r\n
          subStringEnd = subRequest.length - 4;
          jsonBody = "";
        }

        headers = subRequest.substring(subStringStart, subStringEnd);

        const operation = new TableBatchOperation(BatchType.table, headers);
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
      serializedResponses += "ETag: " + response.eTag;
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
      request
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
      serializedResponses += "ETag: " + response.eTag;
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
  public serializeTablMergeEntityBatchResponse(
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
      serializedResponses += "ETag: " + response.eTag;
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
    serializedResponses = this.SerializeXContentTypeOptions(
      serializedResponses
    );
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
      default:
        return "STATUS_CODE_NOT_IMPLEMENTED";
    }
  }

  /**
   * extract a header request string
   *
   * @private
   * @param {string} batchRequestsString
   * @param {string} regExPattern
   * @return {*}
   * @memberof TableBatchSerialization
   */
  private extractRequestHeaderString(
    batchRequestsString: string,
    regExPattern: string
  ) {
    const headerStringMatches = batchRequestsString.match(regExPattern);
    if (headerStringMatches == null) {
      throw StorageError;
    }
    return headerStringMatches[2];
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
    let parenthesesPosition: number = request.getUrl().indexOf("(");
    parenthesesPosition--;
    if (parenthesesPosition < 0) {
      parenthesesPosition = request.getUrl().length;
    }
    const trimmedUrl: string = request
      .getUrl()
      .substring(0, parenthesesPosition);
    let entityPath = trimmedUrl + "(PartitionKey='";
    entityPath += request.params.tableEntityProperties!.PartitionKey;
    entityPath += "',";
    entityPath += "RowKey='";
    entityPath += request.params.tableEntityProperties!.RowKey;
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
    request: BatchRequest | undefined
  ) {
    if (
      undefined !== request &&
      undefined !== request.params &&
      request.params.dataServiceVersion
    ) {
      serializedResponses +=
        "DataServiceVersion: " + request.params.dataServiceVersion + ";\r\n";
    } else {
      // default to 3.0
      serializedResponses += "DataServiceVersion: 3.0;\r\n";
    }
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
    let errorReponse = "";
    const odataError = err as StorageError;
    // Errors in batch processing generate Bad Request error
    errorReponse = this.serializeHttpStatusCode(errorReponse, err.statusCode);
    errorReponse += "Content-ID: " + contentID + "\r\n";
    errorReponse = this.serializeDataServiceVersion(errorReponse, request);
    // ToDo: Check if we need to observe other odata formats for errors
    errorReponse +=
      "Content-Type: application/json;odata=minimalmetadata;charset=utf-8\r\n";
    errorReponse += "\r\n";
    errorReponse += odataError.body + "\r\n";
    return errorReponse;
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
    let errorReponse = "";

    errorReponse += changesetBoundary + "\r\n";
    // Errors in batch processing generate Bad Request error
    errorReponse = this.serializeHttpStatusCode(errorReponse, 400);
    errorReponse = this.SerializeXContentTypeOptions(errorReponse);
    errorReponse = this.serializeDataServiceVersion(errorReponse, undefined);
    // ToDo: Serialize Content type etc
    errorReponse +=
      "Content-Type: application/json;odata=minimalmetadata;charset=utf-8\r\n";
    errorReponse += "\r\n";
    let requestIdResponseString = "";
    if (requestId !== undefined) {
      requestIdResponseString = `RequestId:${requestId}\\n`;
    }
    // 2021-04-23T12:40:31.4944778
    const date = truncatedISO8061Date(new Date(), true);
    errorReponse += `{\"odata.error\":{\"code\":\"InvalidInput\",\"message\":{\"lang\":\"en-US\",\"value\":\"${odataErrorString}\\n${requestIdResponseString}Time:${date}\"}}}\r\n`;
    return errorReponse;
  }
}
