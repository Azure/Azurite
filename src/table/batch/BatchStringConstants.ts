export default class BatchStringConstants {
  public static readonly ACCEPT = "accept";  
  public static readonly ASTERISK = "*";
    public static readonly BATCH_REQ_BOUNDARY = "batch";
    public static readonly BATCH_RES_BOUNDARY = "batchresponse";
    public static readonly BOUNDARY_PREFIX = "--"; 
    public static readonly BOUNDARY_CLOSE_SUFFIX = "--\r\n"; 
    public static readonly CHANGESET_REQ_BOUNDARY = "changeset";
    public static readonly CHANGESET_RES_BOUNDARY = "changesetresponse";
    public static readonly CONTENT_TYPE_MULTIPART_AND_BOUNDARY = "Content-Type: multipart/mixed; boundary=";
    public static readonly CONTENT_TYPE_HTTP = "Content-Type: application/http\r\n";
    public static readonly CRLF = "\r\n";
    public static readonly DATASERVICEVERSION = "maxdataserviceversion";
    public static readonly DoubleCRLF = "\r\n\r\n";
    public static readonly FILTER = "$filter";
    public static readonly FORMAT = "$format";
    public static readonly FULL_META = "fullmeta";
    public static readonly IF_MATCH_HEADER_STRING = "if-match";

    public static readonly MINIMAL_META = "minimalmeta";
    public static readonly MS_CLIENT_REQ_ID = "x-ms-client-request-id";

    public static readonly TOP = "$top";
    public static readonly TRANSFER_ENCODING_BINARY = "Content-Transfer-Encoding: binary\r\n";
    public static readonly SELECT = "$select";
    public static readonly VERB_CONNECT = "CONNECT";
    public static readonly VERB_DELETE = "DELETE";
    public static readonly VERB_GET = "GET";
    public static readonly VERB_HEAD = "HEAD";
    public static readonly VERB_MERGE = "MERGE";
    public static readonly VERB_OPTIONS = "OPTIONS";
    public static readonly VERB_PATCH = "PATCH";
    public static readonly VERB_POST = "POST";
    public static readonly VERB_PUT = "PUT";
    public static readonly VERB_TRACE = "TRACE";
} 