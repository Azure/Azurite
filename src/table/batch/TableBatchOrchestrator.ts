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
import { TableQueryEntitiesWithPartitionAndRowKeyOptionalParams } from "../generated/artifacts/models";
import ITableMetadataStore from "../persistence/ITableMetadataStore";
import { v4 as uuidv4 } from "uuid";
import StorageErrorFactory from "../errors/StorageErrorFactory";

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
  private wasError: boolean = false;
  private errorResponse: string = "";

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
    batchRequestBody: string,
    metadataStore: ITableMetadataStore
  ): Promise<string> {
    this.batchOperations =
      this.serialization.deserializeBatchRequest(batchRequestBody);
    if (this.batchOperations.length > 100) {
      this.wasError = true;
      this.errorResponse = this.serialization.serializeGeneralRequestError(
        "0:The batch request operation exceeds the maximum 100 changes per change set.",
        this.context.xMsRequestID
      );
    } else {
      await this.submitRequestsToHandlers(metadataStore);
    }
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
  private async submitRequestsToHandlers(
    metadataStore: ITableMetadataStore
  ): Promise<void> {
    this.batchOperations.forEach((operation) => {
      const request: BatchRequest = new BatchRequest(operation);
      this.requests.push(request);
    });

    let contentID = 1;
    if (this.requests.length > 0) {
      const accountName = (this.context.account ??= "");
      const tableName = this.requests[0].getPath();
      const batchId = uuidv4();

      // get partition key from the request body or uri to copy that specific partition of database
      const requestPartitionKey = this.extractRequestPartitionKey(
        this.requests[0]
      );

      if (requestPartitionKey === undefined) {
        this.wasError = true;
        this.errorResponse = this.serialization.serializeGeneralRequestError(
          "Partition key not found in request",
          this.context.xMsRequestID
        );
      } else {
        // initialize transaction rollback capability
        await metadataStore.beginBatchTransaction(batchId);
      }

      let batchSuccess = true;
      for (const singleReq of this.requests) {
        try {
          singleReq.response = await this.routeAndDispatchBatchRequest(
            singleReq,
            this.context,
            contentID,
            batchId
          );
        } catch (err: any) {
          batchSuccess = false;
          this.wasError = true;
          this.errorResponse = this.serialization.serializeError(
            err,
            contentID,
            singleReq
          );
          break;
        }
        contentID++;
      }

      await metadataStore.endBatchTransaction(
        accountName,
        tableName,
        batchId,
        this.context,
        batchSuccess
      );
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
      "Content-Type: multipart/mixed; boundary=" +
      changesetBoundary +
      "\r\n\r\n";
    const changesetBoundaryClose: string = "--" + changesetBoundary + "--\r\n";
    changesetBoundary = "--" + changesetBoundary;
    if (this.wasError === false) {
      this.requests.forEach((request) => {
        responseString += changesetBoundary;
        responseString += request.response;
        responseString += "\r\n\r\n";
      });
    } else {
      // serialize the error
      responseString += changesetBoundary + "\r\n";
      // then headers
      responseString += "Content-Type: application/http\r\n";
      responseString += "Content-Transfer-Encoding: binary\r\n";
      responseString += "\r\n";
      // then HTTP/1.1 404 etc
      responseString += this.errorResponse;
    }
    responseString += changesetBoundaryClose;
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
    contentID: number,
    batchId: string
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
            contentID,
            batchId
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
            contentID,
            batchId
          ));
          break;
        case "DELETE":
          // DELETE: we are deleting an entity
          // DELETE	https://myaccount.table.core.windows.net/mytable(PartitionKey='myPartitionKey', RowKey='myRowKey')
          ({ __return, response } = await this.handleBatchDelete(
            request,
            response,
            batchContextClone,
            contentID,
            batchId
          ));
          break;
        case "GET":
          // QUERY : we are querying / retrieving an entity
          // GET	https://myaccount.table.core.windows.net/mytable(PartitionKey='<partition-key>',RowKey='<row-key>')?$select=<comma-separated-property-names>
          ({ __return, response } = await this.handleBatchQuery(
            request,
            response,
            batchContextClone,
            contentID,
            batchId
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
          // this is using the PATCH verb to merge
          ({ __return, response } = await this.handleBatchMerge(
            request,
            response,
            batchContextClone,
            contentID,
            batchId
          ));
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
            contentID,
            batchId
          ));
      }
    } catch (batchException) {
      // this allows us to catch and debug any errors in the batch handling
      throw batchException;
    }
    return __return;
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
    contentID: number,
    batchId: string
  ): Promise<{
    __return: string;
    response: any;
  }> {
    request.ingestOptionalParams(new BatchTableInsertEntityOptionalParams());
    const updatedContext = new TableStorageContext(batchContextClone);
    updatedContext.request = request;
    updatedContext.batchId = batchId;
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
    contentID: number,
    batchId: string
  ): Promise<{
    __return: string;
    response: any;
  }> {
    request.ingestOptionalParams(new BatchTableDeleteEntityOptionalParams());
    const updatedContext = batchContextClone as TableStorageContext;
    updatedContext.request = request;
    updatedContext.batchId = batchId;
    const ifmatch: string = request.getHeader("if-match") || "*";

    const partitionKey = this.extractRequestPartitionKey(request);
    const rowKey = this.extractRequestRowKey(request);
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
    contentID: number,
    batchId: string
  ): Promise<{
    __return: string;
    response: any;
  }> {
    request.ingestOptionalParams(new BatchTableUpdateEntityOptionalParams());
    const updatedContext = batchContextClone as TableStorageContext;
    updatedContext.request = request;
    updatedContext.batchId = batchId;
    const partitionKey = this.extractRequestPartitionKey(request);
    const rowKey = this.extractRequestRowKey(request);
    const ifMatch = request.getHeader("if-match");

    response = await this.parentHandler.updateEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      {
        ifMatch,
        ...request.params
      } as BatchTableUpdateEntityOptionalParams,
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
    contentID: number,
    batchId: string
  ): Promise<{
    __return: string;
    response: any;
  }> {
    // need to validate that query is the only request in the batch!
    const partitionKey = this.extractRequestPartitionKey(request);
    const rowKey = this.extractRequestRowKey(request);

    const updatedContext = batchContextClone as TableStorageContext;
    updatedContext.batchId = batchId;

    if (
      null !== partitionKey &&
      null !== rowKey &&
      partitionKey !== "" &&
      rowKey !== ""
    ) {
      // ToDo: this is hideous... but we need the params on the request object,
      // as they percolate through and are needed for the final serialization
      // currently, because of the way we deconstruct / deserialize, we only
      // have the right model at a very late stage in processing
      // this might resolve when we simplify Query logic
      // based on only accepting Query with partition and row key
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
        __return:
          await this.serialization.serializeTableQueryEntityWithPartitionAndRowKeyBatchResponse(
            request,
            response
          ),
        response
      };
    } else {
      throw StorageErrorFactory.getNotImplementedError(batchContextClone);
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
    contentID: number,
    batchId: string
  ): Promise<{
    __return: string;
    response: any;
  }> {
    request.ingestOptionalParams(new BatchTableMergeEntityOptionalParams());
    const updatedContext = batchContextClone as TableStorageContext;
    updatedContext.request = request;
    updatedContext.batchId = batchId;

    const partitionKey = this.extractRequestPartitionKey(request);
    const rowKey = this.extractRequestRowKey(request);
    const ifMatch = request.getHeader("if-match");

    response = await this.parentHandler.mergeEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      {
        ifMatch,
        ...request.params
      } as BatchTableMergeEntityOptionalParams,
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

  /**
   * extracts the Partition key from a request
   *
   * @private
   * @param {BatchRequest} request
   * @return {*}  {string}
   * @memberof TableBatchOrchestrator
   */
  private extractRequestPartitionKey(
    request: BatchRequest
  ): string | undefined {
    let partitionKey: string | undefined;

    const url = decodeURI(request.getUrl());
    const partKeyMatch = url.match(/(?<=PartitionKey=')(.*)(?=',)/gi);

    if (partKeyMatch === null) {
      // row key not in URL, must be in body
      const body = request.getBody();
      if (body !== "") {
        const jsonBody = JSON.parse(body ? body : "{}");
        partitionKey = jsonBody.PartitionKey;
      }
    } else {
      // keys can have more complex values which are URI encoded
      partitionKey = decodeURIComponent(partKeyMatch[0]);
    }
    return partitionKey;
  }

  /**
   * Helper function to extract values needed for handler calls
   *
   * @private
   * @param {BatchRequest} request
   * @return { string }
   * @memberof TableBatchManager
   */
  private extractRequestRowKey(request: BatchRequest): string {
    let rowKey: string;

    const url = decodeURI(request.getUrl());

    const rowKeyMatch = url.match(/(?<=RowKey=')(.+)(?='\))/gi);
    rowKey = rowKeyMatch ? rowKeyMatch[0] : "";

    if (rowKey === "") {
      // row key not in URL, must be in body
      const body = request.getBody();
      if (body !== "") {
        const jsonBody = JSON.parse(body ? body : "{}");
        rowKey = jsonBody.RowKey;
      }
    } else {
      // keys can have more complex values which are URI encoded
      rowKey = decodeURIComponent(rowKey);
    }
    return rowKey;
  }
}
