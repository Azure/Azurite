## Supported Environment Variable Options

When starting Azurite from npm command line `azurite` or docker image, following environment variables are supported for advanced customization.

### Customized Storage Accounts & Keys

Azurite V3 allows customizing storage account names and keys by providing environment variable `AZURITE_ACCOUNTS` with format `account1:key1[:key2];account2:key1[:key2];...`.

For example, customize one storage account which has only one key:

```cmd
set AZURITE_ACCOUNTS="account1:key1"
```

Or customize multi storage accounts and each has 2 keys:

```cmd
set AZURITE_ACCOUNTS="account1:key1:key2;account2:key1:key2"
```

Azurite will refresh customized account name and key from environment variable every minute by default. With this feature, we can dynamically rotate account key, or add new storage accounts on the air without restarting Azurite instance.

> Note. Default storage account `devstoreaccount1` will be disabled when providing customized storage accounts.

> Note. Should update connection string accordingly if using customized account name and key.

> Note. Use `export` keyword to set environment variable in Linux like environment, `set` in Windows.

### Customized Metadata Storage by External Database (Preview)

By default, Azurite leverages [loki](https://github.com/techfort/LokiJS) as metadata database.
However, as an in-memory database, loki limits Azurite's scalability and data persistency.
Set environment variable `AZURITE_DB=dialect://[username][:password][@]host:port/database` to make Azurite blob service switch to a SQL database based metadata storage, like MySql, SqlServer.

For example, connect to MySql or SqlServer by set environment variables:

```bash
set AZURITE_DB=mysql://username:password@localhost:3306/azurite_blob
set AZURITE_DB=mssql://username:password@localhost:1024/azurite_blob
```

When Azurite starts with above environment variable, it connects to the configured database, and creates tables if not exist.
This feature is in preview, when Azurite changes database table schema, you need to drop existing tables and let Azurite regenerate database tables.

> Note. Need to manually create database before starting Azurite instance.

> Note. Blob Copy & Page Blob are not supported by SQL based metadata implementation.

> Tips. Create database instance quickly with docker, for example `docker run --name mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mysql:latest`. Grant external access and create database `azurite_blob` using `docker exec mysql mysql -u root -pmy-secret-pw -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES; create database azurite_blob;"`. Notice that, above commands are examples, you need to carefully define the access permissions in your production environment.
