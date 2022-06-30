## Differences between Azurite and Azure Storage

Because Azurite runs as a local instance for persistent data storage, there are differences in functionality between Azurite and an Azure storage account in the cloud.

### Storage Accounts

You could enable multiple accounts by setting up environment variable `AZURITE_ACCOUNTS`. See the [section](#customized-storage-accounts--keys-1) above.

Optionally, you could modify your hosts file, to access accounts with production-style URL. See section below.

### Endpoint & Connection URL

The service endpoints for Azurite are different from those of an Azure storage account. The difference is because Azuite runs on local computer, and normally, no DNS resolves address to local.

When you address a resource in an Azure storage account, use the following scheme. The account name is part of the URI host name, and the resource being addressed is part of the URI path:

```
<http|https>://<account-name>.<service-name>.core.windows.net/<resource-path>
```

For example, the following URI is a valid address for a blob in an Azure storage account:

```
https://myaccount.blob.core.windows.net/mycontainer/myblob.txt
```

#### IP-style URL

However, because Azuite runs on local computer, it use IP-style URI by default, and the account name is part of the URI path instead of the host name. Use the following URI format for a resource in Azurite:

```
http://<local-machine-address>:<port>/<account-name>/<resource-path>
```

For example, the following address might be used for accessing a blob in Azurite:

```
http://127.0.0.1:10000/myaccount/mycontainer/myblob.txt
```

The service endpoints for Azurite blob service:

```
http://127.0.0.1:10000/<account-name>/<resource-path>
```

#### Production-style URL

Optionally, you could modify your hosts file, to access an account with production-style URL.

First, add line(s) to your hosts file, like:

```
127.0.0.1 account1.blob.localhost
127.0.0.1 account1.queue.localhost
127.0.0.1 account1.table.localhost
```

Secondly, set environment variables to enable customized storage accounts & keys:

```
set AZURITE_ACCOUNTS="account1:key1:key2"
```

You could add more accounts. See the [section](#customized-storage-accounts--keys-1) above.

Finally, start Azurite and use a customized connection string to access your account.

In the connection string below, it is assumed default ports are used.

```
DefaultEndpointsProtocol=http;AccountName=account1;AccountKey=key1;BlobEndpoint=http://account1.blob.localhost:10000;QueueEndpoint=http://account1.queue.localhost:10001;TableEndpoint=http://account1.table.localhost:10002;
```

> Note. Do not access default account in this way with Azure Storage Explorer. There is a bug that Storage Explorer is always adding account name in URL path, causing failures.

> Note. When use Production-style URL to access Azurite, by default the account name should be the host name in FQDN, like "http://devstoreaccount1.blob.localhost:10000/container". To use Production-style URL with account name in URL path, like "http://foo.bar.com:10000/devstoreaccount1/container", please start Azurite with `--disableProductStyleUrl`.

> Note. If use "host.docker.internal" as request Uri host, like "http://host.docker.internal:10000/devstoreaccount1/container", Azurite will always get account name from request Uri path, not matter Azurite start with `--disableProductStyleUrl` or not.

### Scalability & Performance

> Please reach to us if you have requirements or suggestions for a distributed Azurite implementation or higher performance.

Azurite is not a scalable storage service and does not support many concurrent clients. There is also no performance and TPS guarantee, they highly depend on the environments Azurite has deployed.

### Error Handling

> Please reach to us if you have requirements or suggestions for a specific error handling.

Azurite tries to align with Azure Storage error handling logic, and provides best-efforts alignment based on Azure Storage online documentation. But CANNOT provide 100% alignment, such as error messages (returned in error response body) maybe different (while error status code will align).

### API Version Compatible Strategy

Azurite V3 follows a **Try best to serve** compatible strategy with Azure Storage API versions:

- An Azurite V3 instance has a baseline Azure Storage API version.
  - A Swagger definition (OpenAPI doc) with the same API version will be used to generate protocol layer APIs and interfaces.
  - Azurite should implement all the possible features provided in this API service version.
- If an incoming request has **the same API version** Azurite provides, Azurite should handle the request with parity to Azure Storage.
- If an incoming request has a **higher API version** than Azurite, Azurite will return a InvalidHeaderValue error for `x-ms-version` (HTTP status code 400 - Bad Request).
- If an incoming request has a **lower API version** header than Azurite, Azurite will attempt to handle the request with Azurite's baseline API version behavior instead of that specified in the request.
- Azurite will return API version in response header as the baseline API version
- SAS accepts pattern from API version 2015-04-05

### RA-GRS

Azurite supports read-access geo-redundant replication (RA-GRS). For storage resources both in the cloud and in the local emulator, you can access the secondary location by appending -secondary to the account name. For example, the following address might be used for accessing a blob using the secondary in Azurite:

```
http://127.0.0.1:10000/devstoreaccount1-secondary/mycontainer/myblob.txt
```

> Note. Secondary endpoint is not read-only in Azurite, which diffs from Azure Storage.
