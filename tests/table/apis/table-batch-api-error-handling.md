# Table Batch API Error Handling

## Overview

Each feature or check will be covered by a test case.  
Each test case will be validated against the service.  
The test case against service will be used to validate and set response correctly where not clearly documented for the REST API.

See also:
https://docs.microsoft.com/en-us/rest/api/storageservices/performing-entity-group-transactions#sample-error-response

## Details

The following list of features and behavior will serve as a checklist for testing Azurite Batch API error handling:

### Done:

- When a batch request fails, if the failure is during individual batch item processing, the response must be serialized as a batch response to the client.
- When an individual operation fails, the response for the change set indicates status code 400 (Bad Request).
  - Additional error information within the response indicates which operation failed by returning the index of that operation.
  - The index is the sequence number of the command in the payload via the Content-ID.
- A batch can include at most 100 entities.
- Operations are processed in the order they are specified in the change set.
- The Table service does not support linking operations in a change set.
  -- is this a reference to content-id processing logic (done, as we don't support content id references)
- the batch request returns status code 202 (Accepted), even if one of the operations in the change set fails.
- If the batch request itself fails, it fails before any operation in the change set is executed. (done for max operations, other cases will be addressed as they come up)
- all operations in the change set either succeed or fail.
- All entities in a batch must have the same PartitionKey value.

### ToDo / Validate with test cases:

- Check if we need to observe other odata formats for errors
- An entity can appear only once in a batch, and only one operation may be performed against it.
  - Requires that we check both partition key and row key (as an entity key is made up of both)
- its total payload may be no more than 4 MiB in size.
- There should only be a single change set within a batch.
  --> If a batch includes more than one change set, the first change set will be processed by the service, and additional change sets will be rejected with status code 400 (Bad Request).
- A Query must be a single operation in its batch.
