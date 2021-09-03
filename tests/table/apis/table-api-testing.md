# Table API Testing

## Overview

There are a few different test options for the Table APIs.

### Azure Storage SDK

https://www.npmjs.com/package/azure-storage  
https://github.com/Azure/azure-storage-node

At the time of writing, this was using:

```json
 "azure-storage": "^2.10.3"
```

This is the "legacy" storage SDK.
Initial Entity tests were written using this SDK for convenience sake.  
v10 no longer supports Table API.

### Azure Data-Tables SDK

https://www.npmjs.com/package/@azure/data-tables  
https://github.com/Azure/azure-sdk-for-js/tree/master/sdk/tables/data-tables

At the time of writing, actively maintained.  
Provides more support for Batch / entity group transactions than the legacy SDK.

```json
"@azure/data-tables": "^12.1.1",
```

Long term, new tests should be written using the data-tables package.

### HTTP Rest testing

https://www.npmjs.com/package/axios  
https://github.com/axios/axios

At the time of writing, this is using the axios package:

```json
    "axios": "^0.21.1",
```

These tests take the raw HTTP request information from the debug logs, which include body and header information, and replay these against Azurite to enable easier repros of issues raised by the community.

Eventually, a more automated replay would be desirable, which can replay a log file created by someone with an issue.

Care is currently needed to ensure that the tables used by clients are created with unique keys, and that these are replaced in subsequent requests.
