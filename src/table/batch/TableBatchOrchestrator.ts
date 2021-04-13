import BatchRequest from "../../common/batch/BatchRequest";
import BatchTableInsertEntityOptionalParams from "./BatchTableInsertEntityOptionalParams";
import TableStorageContext from "../context/TableStorageContext";
import Context from "../generated/Context";
import TableHandler from "../handlers/TableHandler";
import { TableBatchSerialization } from "./TableBatchSerialization";
import TableBatchOperation from "./TableBatchOperation";
import BatchTableDeleteEntityOptionalParams from "./BatchTableDeleteEntityOptionalParams";
import BatchTableUpdateEntityOptionalParams from "./BatchTableUpdateEntityOptionalParams";
import BatchTableMergeEntityOptionalParams from "./BatchTableMergeEntityOptionalParams";
import BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams from "./BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams";
import {
  TableQueryEntitiesOptionalParams,
  TableQueryEntitiesWithPartitionAndRowKeyOptionalParams
} from "../generated/artifacts/models";
import BatchTableQueryEntitiesOptionalParams from "./BatchTableQueryEntitiesOptionalParams";

/**
 * Currently there is a single distinct and concrete implementation of batch /
 * entity group operations for the table api.
 * The orchestrator manages the deserialization, submission and serialization of
 * entity group transactions.
 * ToDo: it might be possible to share code between this and the blob batch api, but this
 * has not yet been validated.
 * Will need refactoring when we address batch transactions for blob.
 *
 * @export
 * @class TableBatchOrchestrator
 */
export default class TableBatchOrchestrator {
  private batchOperations: TableBatchOperation[] = [];
  private requests: BatchRequest[] = [];
  private serialization = new TableBatchSerialization();
  private context: TableStorageContext;
  private parentHandler: TableHandler;

  public constructor(context: TableStorageContext, handler: TableHandler) {
    this.context = context;
    this.parentHandler = handler;
  }

  /**
   * This is the central route / sequence of the batch orchestration.
   * Takes batchRequest body, deserializes requests, submits to handlers, then returns serialized response
   *
   * @param {string} batchRequestBody
   * @return {*}  {Promise<string>}
   * @memberof TableBatchManager
   */
  public async processBatchRequestAndSerializeResponse(
    batchRequestBody: string
  ): Promise<string> {
    this.batchOperations = this.serialization.deserializeBatchRequest(
      batchRequestBody
    );

    await this.submitRequestsToHandlers();

    return this.serializeResponses();
  }

  /**
   * Submits requests to the appropriate handlers
   * ToDo: Correct logic and handling of requests with Content ID
   *
   * @private
   * @return {*}  {Promise<void>}
   * @memberof TableBatchManager
   */
  private async submitRequestsToHandlers(): Promise<void> {
    this.batchOperations.forEach((operation) => {
      const request: BatchRequest = new BatchRequest(operation);
      this.requests.push(request);
    });

    let contentID = 1; // contentID starts at 1 for batch
    if (this.requests.length > 0) {
      for (const singleReq of this.requests) {
        try {
          singleReq.response = await this.routeAndDispatchBatchRequest(
            singleReq,
            this.context,
            contentID
          );
        } catch (err) {
          throw err;
        }
        contentID++;
      }
    }
  }

  /**
   * Serializes responses from the table handler
   * see Link below for details of response format
   * tslint:disable-next-line: max-line-length
   * https://docs.microsoft.com/en-us/rest/api/storageservices/performing-entity-group-transactions#json-versions-2013-08-15-and-later-2
   *
   * @private
   * @return {*}  {string}
   * @memberof TableBatchManager
   */
  private serializeResponses(): string {
    let responseString: string = "";
    // based on research, a stringbuilder is only worth doing with 1000s of string ops
    // this can be optimized later if we get reports of slow batch operations
    const batchBoundary = this.serialization.batchBoundary.replace(
      "batch",
      "batchresponse"
    );

    let changesetBoundary = this.serialization.changesetBoundary.replace(
      "changeset",
      "changesetresponse"
    );

    responseString += batchBoundary + "\r\n";
    // (currently static header) ToDo: Validate if we need to correct headers via tests
    responseString +=
      "Content-Type: multipart/mixed; boundary=" + changesetBoundary + "\r\n";
    changesetBoundary = "\r\n--" + changesetBoundary;
    this.requests.forEach((request) => {
      responseString += changesetBoundary;
      responseString += request.response;
      responseString += "\r\n\r\n";
    });
    responseString += changesetBoundary + "--\r\n";
    responseString += batchBoundary + "--\r\n";
    return responseString;
  }

  /**
   * Routes and dispatches single operations against the table handler and stores
   * the serialized result.
   *
   * @private
   * @param {BatchRequest} request
   * @param {Context} context
   * @param {number} contentID
   * @return {*}  {Promise<any>}
   * @memberof TableBatchManager
   */
  private async routeAndDispatchBatchRequest(
    request: BatchRequest,
    context: Context,
    contentID: number
  ): Promise<any> {
    // the context that we have will not work with the calls and needs updating for
    // batch operations, need a suitable deep clone, as each request needs to be treated seaprately
    const batchContextClone = Object.create(context);
    batchContextClone.tableName = request.getPath();
    batchContextClone.path = request.getPath();
    let response: any;
    let __return: any;
    // we only use 5 HTTP Verbs to determine the table operation type
    try {
      switch (request.getMethod()) {
        case "POST":
          // INSERT: we are inserting an entity
          // POST	https://myaccount.table.core.windows.net/mytable
          ({ __return, response } = await this.handleBatchInsert(
            request,
            response,
            batchContextClone,
            contentID
          ));
          break;
        case "PUT":
          // UPDATE: we are updating an entity
          // PUT http://127.0.0.1:10002/devstoreaccount1/mytable(PartitionKey='myPartitionKey', RowKey='myRowKey')
          // INSERT OR REPLACE:
          // PUT	https://myaccount.table.core.windows.net/mytable(PartitionKey='myPartitionKey', RowKey='myRowKey')
          ({ __return, response } = await this.handleBatchUpdate(
            request,
            response,
            batchContextClone,
            contentID
          ));
          break;
        case "DELETE":
          // DELETE: we are deleting an entity
          // DELETE	https://myaccount.table.core.windows.net/mytable(PartitionKey='myPartitionKey', RowKey='myRowKey')
          ({ __return, response } = await this.handleBatchDelete(
            request,
            response,
            batchContextClone,
            contentID
          ));
          break;
        case "GET":
          // QUERY : we are querying / retrieving an entity
          // GET	https://myaccount.table.core.windows.net/mytable(PartitionKey='<partition-key>',RowKey='<row-key>')?$select=<comma-separated-property-names>
          // GET https://myaccount.table.core.windows.net/mytable()?$filter=<query-expression>&$select=<comma-separated-property-names>
          ({ __return, response } = await this.handleBatchQuery(
            request,
            response,
            batchContextClone,
            contentID
          ));
          break;
        case "CONNECT":
          throw new Error("Connect Method unsupported in batch.");
          break;
        case "HEAD":
          throw new Error("Head Method unsupported in batch.");
          break;
        case "OPTIONS":
          throw new Error("Options Method unsupported in batch.");
          break;
        case "TRACE":
          throw new Error("Trace Method unsupported in batch.");
          break;
        case "PATCH":
          throw new Error("Patch Method unsupported in batch.");
          break;
        default:
          // MERGE: this must be the merge, as the merge operation is not currently generated by autorest
          // MERGE	https://myaccount.table.core.windows.net/mytable(PartitionKey='myPartitionKey', RowKey='myRowKey')
          // INSERT OR MERGE
          // MERGE	https://myaccount.table.core.windows.net/mytable(PartitionKey='myPartitionKey', RowKey='myRowKey')
          ({ __return, response } = await this.handleBatchMerge(
            request,
            response,
            batchContextClone,
            contentID
          ));
      }
    } catch (batchException) {
      // this allows us to catch and debug any errors in the batch handling
      throw batchException;
    }
    return __return;
  }

  /**
   * Helper function to extract values needed for handler calls
   *
   * @private
   * @param {BatchRequest} request
   * @return {*}  {{ partitionKey: string; rowKey: string }}
   * @memberof TableBatchManager
   */
  private extractRowAndPartitionKeys(
    request: BatchRequest
  ): { partitionKey: string; rowKey: string } {
    let partitionKey: string;
    let rowKey: string;

    const url = request.getUrl();
    // URL should always be URL encoded
    const partKeyMatch = url.match(/(?<=PartitionKey=%27)(.+)(?=%27,)/gi);
    partitionKey = partKeyMatch ? partKeyMatch[0] : "";
    const rowKeyMatch = url.match(/(?<=RowKey=%27)(.+)(?=%27\))/gi);
    rowKey = rowKeyMatch ? rowKeyMatch[0] : "";

    if (partitionKey === "" || rowKey === "") {
      // row key not in URL, must be in body
      const body = request.getBody();
      if (body !== "") {
        const jsonBody = JSON.parse(body ? body : "{}");
        partitionKey = jsonBody.PartitionKey;
        rowKey = jsonBody.RowKey;
      }
    } else {
      // keys can have more complex values which are URI encoded
      partitionKey = decodeURIComponent(partitionKey);
      rowKey = decodeURIComponent(rowKey);
    }
    return { partitionKey, rowKey };
  }

  /**
   * Handles an insert operation inside a batch
   *
   * @private
   * @param {BatchRequest} request
   * @param {*} response
   * @param {*} batchContextClone
   * @param {number} contentID
   * @return {*}  {Promise<{
   *     __return: string;
   *     response: any;
   *   }>}
   * @memberof TableBatchManager
   */
  private async handleBatchInsert(
    request: BatchRequest,
    response: any,
    batchContextClone: any,
    contentID: number
  ): Promise<{
    __return: string;
    response: any;
  }> {
    request.ingestOptionalParams(new BatchTableInsertEntityOptionalParams());
    const updatedContext = batchContextClone as TableStorageContext;
    updatedContext.request = request;
    response = await this.parentHandler.insertEntity(
      request.getPath(),
      request.params as BatchTableInsertEntityOptionalParams,
      updatedContext
    );
    return {
      __return: this.serialization.serializeTableInsertEntityBatchResponse(
        request,
        response
      ),
      response
    };
  }

  /**
   * Handles a delete Operation inside a batch request
   *
   * @private
   * @param {BatchRequest} request
   * @param {*} response
   * @param {*} batchContextClone
   * @param {number} contentID
   * @return {*}  {Promise<{
   *     __return: string;
   *     response: any;
   *   }>}
   * @memberof TableBatchManager
   */
  private async handleBatchDelete(
    request: BatchRequest,
    response: any,
    batchContextClone: any,
    contentID: number
  ): Promise<{
    __return: string;
    response: any;
  }> {
    request.ingestOptionalParams(new BatchTableDeleteEntityOptionalParams());
    const updatedContext = batchContextClone as TableStorageContext;
    updatedContext.request = request;
    let partitionKey: string;
    let rowKey: string;
    const ifmatch: string = request.getHeader("if-match") || "*";

    ({ partitionKey, rowKey } = this.extractRowAndPartitionKeys(request));
    response = await this.parentHandler.deleteEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      ifmatch,
      request.params as BatchTableDeleteEntityOptionalParams,
      updatedContext
    );

    return {
      __return: this.serialization.serializeTableDeleteEntityBatchResponse(
        request,
        response
      ),
      response
    };
  }

  /**
   * Handles an update Operation inside a batch request
   *
   * @private
   * @param {BatchRequest} request
   * @param {*} response
   * @param {*} batchContextClone
   * @param {number} contentID
   * @return {*}  {Promise<{
   *     __return: string;
   *     response: any;
   *   }>}
   * @memberof TableBatchManager
   */
  private async handleBatchUpdate(
    request: BatchRequest,
    response: any,
    batchContextClone: any,
    contentID: number
  ): Promise<{
    __return: string;
    response: any;
  }> {
    request.ingestOptionalParams(new BatchTableUpdateEntityOptionalParams());
    const updatedContext = batchContextClone as TableStorageContext;
    updatedContext.request = request;
    let partitionKey: string;
    let rowKey: string;
    ({ partitionKey, rowKey } = this.extractRowAndPartitionKeys(request));

    response = await this.parentHandler.updateEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      request.params as BatchTableUpdateEntityOptionalParams,
      updatedContext
    );

    return {
      __return: this.serialization.serializeTableUpdateEntityBatchResponse(
        request,
        response
      ),
      response
    };
  }

  /**
   * Handles a query operation inside a batch request,
   * should only ever be one operation if there is a query
   *
   * @private
   * @param {BatchRequest} request
   * @param {*} response
   * @param {*} batchContextClone
   * @param {number} contentID
   * @return {*}  {Promise<{
   *     __return: string;
   *     response: any;
   *   }>}
   * @memberof TableBatchManager
   */
  private async handleBatchQuery(
    request: BatchRequest,
    response: any,
    batchContextClone: any,
    contentID: number
  ): Promise<{
    __return: string;
    response: any;
  }> {
    let partitionKey: string;
    let rowKey: string;
    ({ partitionKey, rowKey } = this.extractRowAndPartitionKeys(request));

    const updatedContext = batchContextClone as TableStorageContext;

    if (null !== partitionKey && null != rowKey) {
      // ToDo: this is hideous... but we need the params on the request object,
      // as they percolate through and are needed for the final serialization
      // currently, because of the way we deconstruct / deserialize, we only
      // have the right model at a very late stage in processing
      // this might resolve when we simplify Query logic
      // based on only accepting Query iwth partition and row key
      request.ingestOptionalParams(
        new BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams()
      );

      updatedContext.request = request;
      response = await this.parentHandler.queryEntitiesWithPartitionAndRowKey(
        request.getPath(),
        partitionKey,
        rowKey,
        request.params as TableQueryEntitiesWithPartitionAndRowKeyOptionalParams,
        updatedContext
      );
      return {
        __return: await this.serialization.serializeTableQueryEntityWithPartitionAndRowKeyBatchResponse(
          request,
          response
        ),
        response
      };
    } else {
      request.ingestOptionalParams(new BatchTableQueryEntitiesOptionalParams());
      updatedContext.request = request;
      response = await this.parentHandler.queryEntities(
        request.getPath(),
        request.params as TableQueryEntitiesOptionalParams,
        updatedContext
      );
      return {
        __return: await this.serialization.serializeTableQueryEntityBatchResponse(
          request,
          response
        ),
        response
      };
    }
  }

  /**
   * Handles a merge operation inside a batch request
   *
   * @private
   * @param {BatchRequest} request
   * @param {*} response
   * @param {*} batchContextClone
   * @param {number} contentID
   * @return {*}  {Promise<{
   *     __return: string;
   *     response: any;
   *   }>}
   * @memberof TableBatchManager
   */
  private async handleBatchMerge(
    request: BatchRequest,
    response: any,
    batchContextClone: any,
    contentID: number
  ): Promise<{
    __return: string;
    response: any;
  }> {
    request.ingestOptionalParams(new BatchTableMergeEntityOptionalParams());
    const updatedContext = batchContextClone as TableStorageContext;
    updatedContext.request = request;
    let partitionKey: string;
    let rowKey: string;
    ({ partitionKey, rowKey } = this.extractRowAndPartitionKeys(request));

    response = await this.parentHandler.mergeEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      request.params as BatchTableMergeEntityOptionalParams,
      updatedContext
    );

    return {
      __return: this.serialization.serializeTablMergeEntityBatchResponse(
        request,
        response
      ),
      response
    };
  }
}
