### Default Storage Account

Azurite V3 provides support for a default storage account as General Storage Account V2 and associated features.

- Account name: `devstoreaccount1`
- Account key: `Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==`

> Note. Besides SharedKey authentication, Azurite V3 supports account, OAuth, and service SAS authentication. Anonymous access is also available when container is set to allow public access.

### Customized Storage Accounts & Keys

As mentioned by above section. Azurite V3 allows customizing storage account names and keys by providing environment variable `AZURITE_ACCOUNTS` with format `account1:key1[:key2];account2:key1[:key2];...`.

For example, customize one storage account which has only one key:

```cmd
set AZURITE_ACCOUNTS="account1:key1"
```

Or customize multi storage accounts and each has 2 keys:

```cmd
set AZURITE_ACCOUNTS="account1:key1:key2;account2:key1:key2"
```
