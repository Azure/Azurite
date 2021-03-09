import { Stream } from "stream";
import IRequest, { HttpMethod } from "../../table/generated/IRequest";
import BatchOperation from "./BatchOperation";
import BatchRequestHeaders from "./BatchRequestHeaders";
import * as Models from "../../table/generated/artifacts/models";
import BatchTableUpdateEntityOptionalParams from "../../table/batch/BatchTableUpdateEntityOptionalParams";
import BatchTableDeleteEntityOptionalParams from "../../table/batch/BatchTableDeleteEntityOptionalParams";
import BatchTableMergeEntityOptionalParams from "../../table/batch/BatchTableMergeEntityOptionalParams";
import BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams from "../../table/batch/BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams";
import BatchTableInsertEntityOptionalParams from "../../table/batch/BatchTableInsertEntityOptionalParams";
import BatchTableQueryEntitiesOptionalParams from "../../table/batch/BatchTableQueryEntitiesOptionalParams";

// ToDo: Requires validation against all operation types
// currently several funcitons of the interface are not implemented
export default class BatchRequest implements IRequest {
  public response?: any;
  private headers: BatchRequestHeaders;
  private batchOperation: BatchOperation;
  public contentID: number | undefined;
  public constructor(batchOperation: BatchOperation) {
    this.batchOperation = batchOperation;
    this.headers = new BatchRequestHeaders(batchOperation.rawHeaders);
    // set default params, due to our processing logic
    this.params = new BatchTableUpdateEntityOptionalParams();
  }

  // ToDo: This should really be using an interface.
  // refactor once the basic logic is working
  public params:
    | BatchTableDeleteEntityOptionalParams
    | BatchTableUpdateEntityOptionalParams
    | BatchTableMergeEntityOptionalParams
    | BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams
    | BatchTableQueryEntitiesOptionalParams
    | BatchTableInsertEntityOptionalParams;

  // ingests the optional params for a batch request, and sets these
  // based on the type of operation and headers present on an
  // individual request
  public ingestOptionalParams(
    params:
      | BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams
      | BatchTableQueryEntitiesOptionalParams
      | BatchTableDeleteEntityOptionalParams
      | BatchTableUpdateEntityOptionalParams
      | BatchTableMergeEntityOptionalParams
      | BatchTableInsertEntityOptionalParams
  ) {
    this.params = params;
    // need to compare headers to option params and set accordingly
    if (this.getHeader("x-ms-client-request-id") !== undefined) {
      this.params.requestId = this.getHeader("x-ms-client-request-id");
    }

    // Theoretically, this Enum is redundant, and used across all table
    // optional param models, thinking that we only need to use the 1,
    // the code generator is however differentiating across all of them
    // as distinct
    if (this.getHeader("maxdataserviceversion")?.includes("3.0")) {
      this.params.dataServiceVersion =
        Models.DataServiceVersion4.ThreeFullStopZero;
    }
    // TableDeleteEntityOptionalParams is the only interface without a body
    // I instantiate the batch class to enable this check and the other
    // interface acrobatics needed for batch processing
    const body = this.getBody();
    if (
      body != null &&
      body !== "" &&
      !(this.params instanceof BatchTableDeleteEntityOptionalParams)
    ) {
      this.params.tableEntityProperties = JSON.parse(body);
    }

    // set request timeout
    // https://docs.microsoft.com/en-us/rest/api/storageservices/setting-timeouts-for-table-service-operations

    // set responsePreference

    // set queryOptions
    // https://docs.microsoft.com/en-us/rest/api/storageservices/payload-format-for-table-service-operations
    const options: Models.QueryOptions = new Object() as Models.QueryOptions;
    // format
    // set payload options
    if (this.getHeader("accept")?.includes("minimalmeta")) {
      options.format =
        Models.OdataMetadataFormat.Applicationjsonodataminimalmetadata;
    } else if (this.getHeader("accept")?.includes("fullmeta")) {
      options.format =
        Models.OdataMetadataFormat.Applicationjsonodatafullmetadata;
    } else {
      options.format =
        Models.OdataMetadataFormat.Applicationjsonodatanometadata;
    }
    // top
    // select
    // filter
    this.params.queryOptions = options;
  }

  public getMethod(): HttpMethod {
    if (this.batchOperation.httpMethod != null) {
      return this.batchOperation.httpMethod;
    } else {
      throw new Error("httpMethod invalid on batch operation");
    }
  }

  public getUrl(): string {
    // ToDo: is this a valid assumption for the batch API?
    // ToDo: here we also assume https, which is also not true...
    // we need to parse this from the request
    // return `https://${this.accountName}.${this.batchOperation.batchType}.core.windows.net/$batch`;
    // in delete, it seems that we actuall expect the full uri
    if (this.batchOperation.uri != null && this.batchOperation.path != null) {
      return this.batchOperation.uri;
      // this substring is not needed.
      // .substring(
      //   0,
      //   this.batchOperation.uri.length - this.batchOperation.path.length
      // );
    } else {
      throw new Error("uri or path null when calling getUrl on BatchRequest");
    }
  }

  public getEndpoint(): string {
    throw new Error("Method not implemented.");
  }

  public getPath(): string {
    if (this.batchOperation.path != null) {
      return this.batchOperation.path;
    } else {
      throw new Error("path null  when calling getPath on BatchRequest");
    }
  }

  public getBodyStream(): NodeJS.ReadableStream {
    if (this.batchOperation.jsonRequestBody != null) {
      return Stream.Readable.from(this.batchOperation.jsonRequestBody);
    } else {
      throw new Error("body null  when calling getBodyStream on BatchRequest");
    }
  }

  public setBody(body: string | undefined): IRequest {
    throw new Error("Method not implemented.");
  }

  public getBody(): string | undefined {
    if (this.batchOperation.jsonRequestBody != null) {
      return this.batchOperation.jsonRequestBody;
    } else {
      throw new Error("body null  when calling getBody on BatchRequest");
    }
  }

  public getHeader(field: string): string | undefined {
    return this.headers.header(field);
  }

  public getHeaders(): { [header: string]: string | string[] | undefined } {
    throw new Error("Method not implemented.");
  }

  public getRawHeaders(): string[] {
    return this.batchOperation.rawHeaders;
  }

  public getQuery(key: string): string | undefined {
    switch (key) {
      case "$format":
        return this.params.queryOptions?.format;
      case "$top":
        return this.params.queryOptions?.top?.toLocaleString();
      case "$select":
        return this.params.queryOptions?.select;
      case "$filter":
        return this.params.queryOptions?.filter;
      default:
        break;
    }
    throw new Error("unknown query options type.");
  }

  public getProtocol(): string {
    if (
      this.batchOperation.protocol !== null &&
      this.batchOperation.protocol !== undefined
    ) {
      return this.batchOperation.protocol;
    } else {
      // try extract protocol
      const protocolMatch = this.getUrl().match(/https?/);
      if (protocolMatch !== null && protocolMatch!.length > 0) {
        this.batchOperation.protocol = protocolMatch[0];
        return this.batchOperation.protocol;
      }
      throw new Error("protocol null when calling getProtocol on BatchRequest");
    }
  }
}
