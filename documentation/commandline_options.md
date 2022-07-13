## Supported Command Line Options

### 1. Listening Host Configuration

Optional. By default, Azurite V3 will listen to 127.0.0.1 as a local server.
You can customize the listening address per your requirements.

#### Only Accept Requests in Local Machine

```cmd
--blobHost 127.0.0.1
--queueHost 127.0.0.1
--tableHost 127.0.0.1
```

#### Allow Accepting Requests from Remote (potentially unsafe)

```cmd
--blobHost 0.0.0.0
--queueHost 0.0.0.0
--tableHost 0.0.0.0
```

### 2. Listening Port Configuration [Optional]

By default, Azurite V3 will listen to 10000 as blob service port, and 10001 as queue service port, and 10002 as the table service port.
You can customize the listening port per your requirements.

> Warning: After using a customized port, you need to update connection string or configurations correspondingly in your Storage Tools or SDKs.
> If starting Azurite you see error `Error: listen EACCES 0.0.0.0:10000` the TCP port is most likely already occupied by another process.

#### Customize Blob/Queue Service Listening Port

```cmd
--blobPort 8888
--queuePort 9999
--tablePort 11111
```

#### Let System Auto Select an Available Port

```cmd
--blobPort 0
--queuePort 0
--tablePort 0
```

> Note: The port in use is displayed on Azurite startup.

### 3. Workspace Path Configuration [Optional]

Azurite V3 needs to persist metadata and binary data to local disk during execution.

You can provide a customized path as the workspace location, or by default, Current process working directory will be used.

```cmd
-l c:\azurite
--location c:\azurite
```

### 4. Access Log Configuration [Optional]

By default Azurite will display access log in console. **Disable** it by:

```cmd
-s
--silent
```

### 5. Debug Log Configuration [Optional]

Debug log includes detailed information on every request and exception stack traces.
Enable it by providing a valid local file path for the debug log destination.

```cmd
-d path/debug.log
--debug path/debug.log
```

### 6. Loose Mode Configuration [Optional]

By default Azurite will apply strict mode. Strict mode will block unsupported request headers or parameters. **Disable** it by enabling loose mode:

```cmd
-L
--loose
```

### 7. Certificate Configuration (HTTPS) [Optional]

By default Azurite will listen on HTTP protocol. Provide a PEM or PFX certificate file path to enable HTTPS mode:

```cmd
--cert path/server.pem
```

When `--cert` is provided for a PEM file, must provide coresponding `--key`.

```cmd
--key path/key.pem
```

When `--cert` is provided for a PFX file, must provide coresponding `--pwd`

```cmd
--pwd pfxpassword
```

### 8. OAuth Configuration [Optional]

By default, Azurite doesn't support OAuth and bearer token. Enable OAuth authentication for Azurite by:

```
--oauth basic
```

> Note. OAuth requires HTTPS endpoint. Make sure HTTPS is enabled by providing `--cert` parameter along with `--oauth` parameter.

Currently, Azurite supports following OAuth authentication levels:

#### Basic

In basic level, `--oauth basic`, Azurite will do basic authentication, like validating incoming bearer token, checking issuer, audience, expiry. But Azurite will NOT check token signature and permission.

### 9. Skip API Version Check [Optional]

By default Azurite will check the request API version is valid API version. Skip the API version check by:

```cmd
--skipApiVersionCheck
```

### 10. Disable Product Style Url [Optional]

When using FQDN instead of IP in request Uri host, by default Azurite will parse storage account name from request Uri host. Force parsing storage account name from request Uri path by:

```cmd
--disableProductStyleUrl
```

### 11. Command Line Options Differences between Azurite V2

Azurite V3 supports SharedKey, Account Shared Access Signature (SAS), Service SAS, OAuth, and Public Container Access authentications, you can use any Azure Storage SDKs or tools like Storage Explorer to connect Azurite V3 with any authentication strategy.

An option to bypass authentication is **NOT** provided in Azurite V3.
