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

export enum BatchQueryType {
  query = 0,
  queryentities = 2,
  querywithpartitionandrowkey = 4
}

// Currently there is a single distinct and concrete implementation of batch /
// entity group operations for the table api.
// it might be possible to share code between this and the blob batch api, but this
// has not yet been validated.
export default class TableBatchManager {
  private batchOperations: TableBatchOperation[] = [];
  private requests: BatchRequest[] = [];
  private serialization = new TableBatchSerialization();
  private context: TableStorageContext;
  private parentHandler: TableHandler;

  public constructor(context: TableStorageContext, handler: TableHandler) {
    this.context = context;
    this.parentHandler = handler;
  }

  // Takes batchRequest body, deserializes requests, submits to handlers, then returns serialized response
  public async processBatchRequestAndSerializeResponse(
    batchRequestBody: string
  ): Promise<string> {
    this.deserializeBatchRequests(batchRequestBody);

    await this.submitRequestsToHandlers();

    return this.serializeResponses();
  }

  private deserializeBatchRequests(batchRequestBody: string): void {
    this.batchOperations = this.serialization.deserializeBatchRequest(
      batchRequestBody
    );
  }

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

  // see Link below for details of response format
  // tslint:disable-next-line: max-line-length
  // https://docs.microsoft.com/en-us/rest/api/storageservices/performing-entity-group-transactions#json-versions-2013-08-15-and-later-2
  private serializeResponses(): string {
    let responseString: string = "";
    // based on research, a stringbuilder is only worth doing with 1000s of string ops
    const batchBoundary = this.serialization.batchBoundary.replace(
      "batch",
      "batchresponse"
    );

    let changesetBoundary = this.serialization.changesetBoundary.replace(
      "changeset",
      "changesetresponse"
    );

    // --batchresponse_e69b1c6c-62ff-471e-ab88-9a4aeef0a880
    responseString += batchBoundary + "\n";
    // (currently static header) ToDo: Validate if we need to correct headers via tests
    // Content-Type: multipart/mixed; boundary=changesetresponse_a6253244-7e21-42a8-a149-479ee9e94a25
    responseString +=
      "Content-Type: multipart/mixed; boundary=" + changesetBoundary + "\n";

    changesetBoundary = "\n--" + changesetBoundary;
    this.requests.forEach((request) => {
      // need to add the boundaries
      // --changesetresponse_a6253244-7e21-42a8-a149-479ee9e94a25
      responseString += changesetBoundary;

      responseString += request.response;
    });

    // --changesetresponse_a6253244-7e21-42a8-a149-479ee9e94a25--
    responseString += changesetBoundary + "--\n";
    // --batchresponse_e69b1c6c-62ff-471e-ab88-9a4aeef0a880--
    responseString += "\n" + batchBoundary + "--\n";

    return responseString;
  }

  // Routes and dispatches single operations against the table handler and stores
  // the serialized result
  private async routeAndDispatchBatchRequest(
    request: BatchRequest,
    context: Context,
    contentID: number
  ): Promise<any> {
    // the context that we have will not work with the calls and needs updating for
    // batch operations, need a suitable deep clone, as each request needs to be treated seaprately
    // this might be too shallow with inheritance
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
          try {
            ({ __return, response } = await this.handleBatchInsert(
              request,
              response,
              batchContextClone,
              contentID
            ));
          } catch (putException) {
            throw putException;
          }
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

  private extractRowAndPartitionKeys(
    request: BatchRequest
  ): { partitionKey: string; rowKey: string } {
    let partitionKey: string;
    let rowKey: string;

    const url = request.getUrl();
    const partKeyMatch = url.match(/(PartitionKey=)(%27)?'?(\w+)/gi);
    partitionKey = partKeyMatch ? partKeyMatch[0] : "";
    const rowKeyMatch = url.match(/(RowKey=)(%27)?'?(\w+)/gi);
    rowKey = rowKeyMatch ? rowKeyMatch[0] : "";

    if (partitionKey !== "" || rowKey !== "") {
      // we need to filter out the delimeter (if URL encoded)
      const urlencodedMatch = partitionKey.match(/%/);
      let matchStringLength = 14;
      if (urlencodedMatch) {
        matchStringLength += 2;
      }
      partitionKey = partitionKey.substring(matchStringLength);
      matchStringLength = 8;
      if (urlencodedMatch) {
        matchStringLength += 2;
      }
      rowKey = rowKey.substring(matchStringLength);
    } else {
      // row key not in URL, must be in body
      const body = request.getBody();
      if (body !== "") {
        const jsonBody = JSON.parse(body ? body : "{}");
        partitionKey = jsonBody.PartitionKey;
        rowKey = jsonBody.RowKey;
      }
    }
    return { partitionKey, rowKey };
  }

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
    ({ partitionKey, rowKey } = this.extractRowAndPartitionKeys(request));

    // Note: If we don't match row and partition key, then we will throw a storage exception
    // later, which is OK for me
    response = await this.parentHandler.deleteEntity(
      request.getPath(),
      partitionKey,
      rowKey,
      "*", // ToDo: Correctly parse the if-match / Etag header
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
    // We have 3 possible functions in the handler for query:
    // queryEntitiesWithPartitionAndRowKey
    // query
    // queryEntities

    if (null !== partitionKey && null != rowKey) {
      // ToDO: this is hideous... but we need the params on the request object,
      // as they percolate through and are needed for the final serialization
      // currently, because of the way we deconstruct / deserialize, we only
      // have the right model at a very late stage in processing
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
      // Not even sure that we support this... query entities
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
