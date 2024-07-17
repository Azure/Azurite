import BatchRequest from "./BatchRequest";
import BatchTableInsertEntityOptionalParams from "./BatchTableInsertEntityOptionalParams";
import TableStorageContext from "../context/TableStorageContext";
import Context from "../generated/Context";
import TableHandler from "../handlers/TableHandler";
import { TableBatchSerialization } from "./TableBatchSerialization";
import BatchTableDeleteEntityOptionalParams from "./BatchTableDeleteEntityOptionalParams";
import BatchTableUpdateEntityOptionalParams from "./BatchTableUpdateEntityOptionalParams";
import BatchTableMergeEntityOptionalParams from "./BatchTableMergeEntityOptionalParams";
import BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams from "./BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams";
import { TableQueryEntitiesWithPartitionAndRowKeyOptionalParams } from "../generated/artifacts/models";
import ITableMetadataStore from "../persistence/ITableMetadataStore";
import { v4 as uuidv4 } from "uuid";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import TableBatchRepository from "./TableBatchRepository";
import BatchStringConstants from "./BatchStringConstants";
import BatchErrorConstants from "./BatchErrorConstants";

/**
 * Currently there is a single distinct and concrete implementation of batch /
 * entity group operations for the table api.
 * The orchestrator manages the deserialization, submission and serialization of
 * entity group transactions.
 * ToDo: it might be possible to share code between this and the blob batch api, but there
 * is relatively little commonality, due to the different ACL models and the fact that
 * Azure Tables is owned by a different group to the Azure Blob Storage team.
 *
 * @export
 * @class TableBatchOrchestrator
 */
export default class TableBatchOrchestrator {
  private serialization = new TableBatchSerialization();
  private context: TableStorageContext;
  private parentHandler: TableHandler;
  private wasError: boolean = false;
  private errorResponse: string = "";
  private readonly repository: TableBatchRepository;
  // add a private member which will is a map of row keys to partition keys
  // this will be used to check for duplicate row keys in a batch request
  private partitionKeyMap: Map<string, string> = new Map<string, string>();

  public constructor(
    context: TableStorageContext,
    handler: TableHandler,
    metadataStore: ITableMetadataStore
  ) {
    this.context = context;
    this.parentHandler = handler;
    this.repository = new TableBatchRepository(metadataStore);
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
    const batchOperations =
      this.serialization.deserializeBatchRequest(batchRequestBody);
    if (batchOperations.length > 100) {
      this.wasError = true;
      this.errorResponse = this.serialization.serializeGeneralRequestError(
        BatchErrorConstants.TOO_MANY_OPERATIONS,
        this.context.xMsRequestID
      );
    } else {
      batchOperations.forEach((operation) => {
        const request: BatchRequest = new BatchRequest(operation);
        this.repository.addBatchRequest(request);
      });
      await this.submitRequestsToHandlers();
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
  private async submitRequestsToHandlers(): Promise<void> {
    let contentID = 1;
    if (this.repository.getBatchRequests().length > 0) {
      const accountName = (this.context.account ??= "");
      const tableName = this.repository.getBatchRequests()[0].getPath();
      const batchId = uuidv4();

      this.checkForPartitionKey();

      // initialize transaction rollback capability
      await this.initTransaction(batchId);

      let batchSuccess = true;
      for (const singleReq of this.repository.getBatchRequests()) {
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

      await this.repository.endBatchTransaction(
        accountName,
        tableName,
        batchId,
        this.context,
        batchSuccess
      );
    }
  }

  /**
   * Ensures that we have a partition key for the batch request
   *
   * @private
   * @memberof TableBatchOrchestrator
   */
  private checkForPartitionKey() {
    const requestPartitionKey = this.extractRequestPartitionKey(
      this.repository.getBatchRequests()[0]
    );

    if (requestPartitionKey === undefined) {
      this.wasError = true;
      this.errorResponse = this.serialization.serializeGeneralRequestError(
        BatchErrorConstants.NO_PARTITION_KEY,
        this.context.xMsRequestID
      );
    }
  }

  /**
   * Initializes the transaction for the batch request in the metadata store
   *
   * @param {string} batchId
   * @memberof TableBatchOrchestrator
   */
  async initTransaction(batchId: string) {
    if (this.wasError == false) {
      await this.repository.beginBatchTransaction(batchId);
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
      BatchStringConstants.BATCH_REQ_BOUNDARY,
      BatchStringConstants.BATCH_RES_BOUNDARY
    );

    let changesetBoundary = this.serialization.changesetBoundary.replace(
      BatchStringConstants.CHANGESET_REQ_BOUNDARY,
      BatchStringConstants.CHANGESET_RES_BOUNDARY
    );

    responseString += batchBoundary + BatchStringConstants.CRLF;
    // (currently static header) ToDo: Validate if we need to correct headers via tests
    responseString = this.serializeContentTypeAndBoundary(
      responseString,
      changesetBoundary
    );
    const changesetBoundaryClose: string =
      BatchStringConstants.BOUNDARY_PREFIX +
      changesetBoundary +
      BatchStringConstants.BOUNDARY_CLOSE_SUFFIX;
    changesetBoundary =
      BatchStringConstants.BOUNDARY_PREFIX + changesetBoundary;
    if (this.wasError === false) {
      this.repository.getBatchRequests().forEach((request) => {
        responseString += changesetBoundary;
        responseString += request.response;
        responseString += BatchStringConstants.DoubleCRLF;
      });
    } else {
      // serialize the error
      responseString += changesetBoundary + BatchStringConstants.CRLF;
      // then headers
      responseString += BatchStringConstants.CONTENT_TYPE_HTTP;
      responseString += BatchStringConstants.TRANSFER_ENCODING_BINARY;
      responseString += BatchStringConstants.CRLF;
      // then HTTP/1.1 404 etc
      responseString += this.errorResponse;
    }
    responseString += changesetBoundaryClose;
    responseString +=
      batchBoundary + BatchStringConstants.BOUNDARY_CLOSE_SUFFIX;
    return responseString;
  }

  private serializeContentTypeAndBoundary(
    responseString: string,
    changesetBoundary: string
  ) {
    responseString +=
      BatchStringConstants.CONTENT_TYPE_MULTIPART_AND_BOUNDARY +
      changesetBoundary +
      BatchStringConstants.DoubleCRLF;
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
    const batchContextClone = this.createBatchContextClone(
      context,
      request,
      batchId
    );

    let response: any;
    let __return: any;
    // we only use 5 HTTP Verbs to determine the table operation type
    try {
      switch (request.getMethod()) {
        case BatchStringConstants.VERB_POST:
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
        case BatchStringConstants.VERB_PUT:
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
        case BatchStringConstants.VERB_DELETE:
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
        case BatchStringConstants.VERB_GET:
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
        case BatchStringConstants.VERB_CONNECT:
          throw new Error("Connect Method unsupported in batch.");
          break;
        case BatchStringConstants.VERB_HEAD:
          throw new Error("Head Method unsupported in batch.");
          break;
        case BatchStringConstants.VERB_OPTIONS:
          throw new Error("Options Method unsupported in batch.");
          break;
        case BatchStringConstants.VERB_TRACE:
          throw new Error("Trace Method unsupported in batch.");
          break;
        case BatchStringConstants.VERB_PATCH:
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
   * Creates a clone of the context for the batch operation.
   * Because the context that we have will not work with the calls and needs
   * updating for batch operations.
   * We use a deep clone, as each request needs to be treated separately.
   *
   * @private
   * @param {Context} context
   * @param {BatchRequest} request
   * @return {*}
   * @memberof TableBatchOrchestrator
   */
  private createBatchContextClone(
    context: Context,
    request: BatchRequest,
    batchId: string
  ) {
    const batchContextClone = Object.create(context);
    batchContextClone.tableName = request.getPath();
    batchContextClone.path = request.getPath();
    const updatedContext = new TableStorageContext(batchContextClone);
    updatedContext.request = request;
    updatedContext.batchId = batchId;
    return updatedContext;
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
    const { partitionKey, rowKey } = this.extractKeys(request);
    this.validateBatchRequest(partitionKey, rowKey, batchContextClone);
    response = await this.parentHandler.insertEntity(
      request.getPath(),
      request.params as BatchTableInsertEntityOptionalParams,
      batchContextClone
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
    const ifmatch: string =
      request.getHeader(BatchStringConstants.IF_MATCH_HEADER_STRING) ||
      BatchStringConstants.ASTERISK;

    const { partitionKey, rowKey } = this.extractKeys(request);
    this.validateBatchRequest(partitionKey, rowKey, batchContextClone);
    response = await this.parentHandler.deleteEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      ifmatch,
      request.params as BatchTableDeleteEntityOptionalParams,
      batchContextClone
    );

    return {
      __return: this.serialization.serializeTableDeleteEntityBatchResponse(
        request,
        response
      ),
      response
    };
  }

  private extractKeys(request: BatchRequest) {
    const partitionKey = this.extractRequestPartitionKey(request);
    const rowKey = this.extractRequestRowKey(request);
    return { partitionKey, rowKey };
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
    const { partitionKey, rowKey } = this.extractKeys(request);
    this.validateBatchRequest(partitionKey, rowKey, batchContextClone);
    const ifMatch = request.getHeader(
      BatchStringConstants.IF_MATCH_HEADER_STRING
    );

    response = await this.parentHandler.updateEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      {
        ifMatch,
        ...request.params
      } as BatchTableUpdateEntityOptionalParams,
      batchContextClone
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
    const { partitionKey, rowKey } = this.extractKeys(request);

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

      response = await this.parentHandler.queryEntitiesWithPartitionAndRowKey(
        request.getPath(),
        partitionKey,
        rowKey,
        request.params as TableQueryEntitiesWithPartitionAndRowKeyOptionalParams,
        batchContextClone
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
    const { partitionKey, rowKey } = this.extractKeys(request);
    this.validateBatchRequest(partitionKey, rowKey, batchContextClone);
    response = await this.parentHandler.mergeEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      {
        ifMatch: request.getHeader(BatchStringConstants.IF_MATCH_HEADER_STRING),
        ...request.params
      } as BatchTableMergeEntityOptionalParams,
      batchContextClone
    );

    return {
      __return: this.serialization.serializeTableMergeEntityBatchResponse(
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
    const originalUrl = request.getUrl();
    const url = decodeURIComponent(originalUrl);
    const partKeyMatch = url.match(/(?<=PartitionKey=')(.*)(?=',)/gi);

    if (partKeyMatch === null) {
      // row key not in URL, must be in body
      const body = request.getBody();
      if (body !== "") {
        const jsonBody = JSON.parse(body ? body : "{}");
        partitionKey = jsonBody.PartitionKey;
      }
    } else {
      // keys can have more complex values which are URI encoded if they come from the URL
      // we decode above.
      partitionKey = partKeyMatch[0];
      // Url should use double ticks and we need to remove them
      partitionKey = this.replaceDoubleTicks(partitionKey);
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
    let rowKey: any;
    // problem: sometimes the ticks are encoded, sometimes not!
    // this is a difference between Azure Data-Tables and the deprecated
    // Azure Storage SDK decode URI component will not remove double ticks
    const url = decodeURIComponent(request.getUrl());

    const rowKeyMatch = url.match(/(?<=RowKey=')(.+)(?='\))/gi);
    rowKey = rowKeyMatch ? rowKeyMatch[0] : "";
    // Url should use double ticks and we need to remove them
    rowKey = this.replaceDoubleTicks(rowKey);
    if (rowKeyMatch === null) {
      // row key not in URL, must be in body
      const body = request.getBody();
      if (body !== "") {
        const jsonBody = JSON.parse(body ? body : "{}");
        rowKey = jsonBody.RowKey;
      }
    }

    return rowKey;
  }

  /**
   * Replace Double ticks for single ticks without replaceAll string prototype
   * function, because node 14 does not support it.
   * @param key
   * @returns
   */
  private replaceDoubleTicks(key: string): string {
    const result = key.replace(/''/g, "'");
    return result;
  }

  /**
   * Helper function to validate batch requests.
   * Additional validation functions should be added here.
   *
   * @private
   * @param {string} partitionKey
   * @param {string} rowKey
   * @param {*} batchContextClone
   * @memberof TableBatchOrchestrator
   */
  private validateBatchRequest(
    partitionKey: string | undefined,
    rowKey: string,
    batchContextClone: any
  ) {
    if (partitionKey === undefined) {
      throw StorageErrorFactory.getInvalidInput(batchContextClone);
    }
    this.checkForDuplicateRowKey(partitionKey, rowKey, batchContextClone);
  }

  /**
   *
   *
   *
   * @private
   * @param {string} partitionKey
   * @param {string} rowKey
   * @param {*} batchContextClone
   * @memberof TableBatchOrchestrator
   */
  private checkForDuplicateRowKey(
    partitionKey: string,
    rowKey: string,
    batchContextClone: any
  ) {
    const key = partitionKey + rowKey;
    if (this.partitionKeyMap.has(key)) {
      throw StorageErrorFactory.getBatchDuplicateRowKey(
        batchContextClone,
        rowKey
      );
    } else {
      this.partitionKeyMap.set(key, partitionKey);
    }
  }
}
