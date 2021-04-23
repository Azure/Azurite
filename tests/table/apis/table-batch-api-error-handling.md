# Table Batch API Error Handling

## Overview

Each feature or check will be covered by a test case.  
Each test case will be validated against the service.  
The test case against service will be used to validate and set response correctly where not clearly documented for the REST API.

See also:
https://docs.microsoft.com/en-us/rest/api/storageservices/performing-entity-group-transactions#sample-error-response

## Details

The following list of features and behavior will serve as a checklist for testing Azurite Batch API error handling:

- When a batch request fails, if the failure is during individual batch item processing, the response must be serialized as a batch response to the client. (done)
- When an individual operation fails, the response for the change set indicates status code 400 (Bad Request).
  - Additional error information within the response indicates which operation failed by returning the index of that operation. The index is the sequence number of the command in the payload via the Content-ID. (done)
- All entities in a batch must have the same PartitionKey value.
- An entity can appear only once in a batch, and only one operation may be performed against it.
  - Requires that we check both partition key and row key (as an entity key is made up of both)
- A batch can include at most 100 entities

  - Error should look like a standard serialized batch error, accepted with 202, internall REST error of 400:
    --batchresponse_c758570b-52bd-47c4-8e80-d368a0c0f310\r\n
    Content-Type: multipart/mixed; boundary=changesetresponse_77dfbe65-cb7f-4bdf-a8f7-626dbfacd436\r\n
    \r\n
    --changesetresponse_77dfbe65-cb7f-4bdf-a8f7-626dbfacd436\r\n
    Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n
    \r\n
    HTTP/1.1 400 Bad Request\r\n
    X-Content-Type-Options: nosniff\r\n
    DataServiceVersion: 3.0;\r\n
    Content-Type: application/json;odata=minimalmetadata;streaming=true;charset=utf-8\r\n
    \r\n
    {\"odata.error\":{\"code\":\"InvalidInput\",\"message\":{\"lang\":\"en-US\",\"value\":\"0:The batch request operation exceeds the maximum 100 changes per change set.\\nRequestId:8d58a05b-8002-0049-573d-384cd1000000\\nTime:2021-04-23T12:40:31.4944778Z\"}}}\r\n
    --changesetresponse_77dfbe65-cb7f-4bdf-a8f7-626dbfacd436--\r\n
    --batchresponse_c758570b-52bd-47c4-8e80-d368a0c0f310--\r\n"

  - its total payload may be no more than 4 MiB in size.

- There should only be a single change set within a batch.
  --> If a batch includes more than one change set, the first change set will be processed by the service, and additional change sets will be rejected with status code 400 (Bad Request).
- A Query must be a single operation in its batch.
- Operations are processed in the order they are specified in the change set. (done)
- The Table service does not support linking operations in a change set.
  -- is this a reference to content-id processing logic (done, as we don't support content id references)
- all operations in the change set either succeed or fail.
- the batch request returns status code 202 (Accepted), even if one of the operations in the change set fails. (done)
- If the batch request itself fails, it fails before any operation in the change set is executed.
