export default class BatchErrorConstants {
  public static readonly BODY_NULL = "Body null when calling getBody on BatchRequest.";  
  public static readonly NO_PARTITION_KEY =  "Partition key not found in request.";
  public static readonly METHOD_INVALID = "HttpMethod invalid on batch operation.";
  public static readonly METHOD_NOT_IMPLEMENTED = "Method not implemented.";
  public static readonly PATH_NULL = "Path null when calling getPath on BatchRequest.";
  public static readonly PROTOCOL_NULL = "Protocol null when calling getProtocol on BatchRequest";
  public static readonly TOO_MANY_OPERATIONS = "0:The batch request operation exceeds the maximum 100 changes per change set.";
  public static readonly UNKNOWN_QUERYOPTION = "Unknown query options type.";
  public static readonly URI_NULL = "URI or path null when calling getUrl on BatchRequest.";
}