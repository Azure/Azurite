# Add Blob Versioning Support

- Author Name: Rodolfo Orozco Vasquez ([@rorozcov](https://github.com/rorozcov))
- GitHub Issue: [Azure/Azurite#665](https://github.com/Azure/Azurite/issues/665)

## Summary

This design adds support for Azure Blob Storage versioning to Azurite, allowing blobs to maintain previous versions automatically when they are modified or deleted. Versioning is implemented following the [Azure Blob Storage versioning guidelines](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview) as closely as possible, with some limitations based on features not yet supported in Azurite.

## Motivation

Blob versioning is a critical feature in Azure Blob Storage that automatically maintains previous versions of a blob. This enables users to:

- Recover from accidental blob modifications or deletions
- Maintain a history of blob changes over time
- Access and restore previous versions of blobs

Without blob versioning support in Azurite, developers cannot fully test applications that rely on this feature locally, limiting their ability to validate version-aware workflows before deploying to Azure.

## Explanation

### Functional explanation

Blob versioning in Azurite is controlled through the `AccountModel` abstraction, which allows configuration of storage account-level settings. When enabled, blob versioning automatically creates a new version of a blob whenever it is modified or overwritten.

Two command line options are available to configure blob versioning:

1. **`--accountConfigFilePath`** - Path to a JSON configuration file
2. **`--accountConfigAsJson`** - Inline JSON string configuration

We also support multi-account configuration since Azurite supports multiple accounts.

### Technical explanation

Blob versioning is implemented using the `AccountModel` type which is stored in the metadata database:

```typescript
export interface AccountModel {
  key: string;
  isBlobVersioningEnabled?: boolean;
}
```

When versioning is enabled for an account:

- **For block blobs:** All write operations trigger the creation of a new version, except for the Put Block operation
- **For page blobs and append blobs:** Only a subset of write operations triggers version creation:
  - Put Blob
  - Put Block List
  - Set Blob Metadata
  - Copy Blob
- **Operations that do NOT trigger version creation:**
  - Put Page (page blob)
  - Append Block (append blob)
- Each version is assigned a unique version ID in ISO 8601 date-time format
  - **Note:** Azurite's version IDs end in 3 digits + Z (e.g., `2024-12-06T10:30:45.123Z`) due to JavaScript's Date implementation, while Azure's version IDs end in 7 digits + Z (e.g., `2024-12-06T10:30:45.1234567Z`). If your application relies on this specific format, plan accordingly.
- Previous versions are immutable and can be accessed using the version ID
- The `List Blobs` operation can include versions when the `includeVersions` parameter is set to true
- Specific versions can be retrieved, downloaded, or deleted using the `versionId` query parameter

The configuration is parsed through `EnvironmentFunctions.parseAccountModelFlags()` which supports:

- Single account configuration
- Multi-account configuration with comma-separated entries
- Both file-based and inline JSON configurations
- Proper JSON parsing with support for nested objects and escaped characters

### Integration with Authentication

> **Important:** The `AccountModel` configuration only controls the versioning behavior. To actually use the configured accounts, they must also be set up in the `AZURITE_ACCOUNTS` environment variable for authentication. See [Customized Storage Accounts & Keys](https://github.com/Azure/Azurite#customized-storage-accounts--keys-1) for details.

### Limitations

The following Azure Blob Storage versioning features are **not** currently supported:

- Soft delete integration with versioning
- Blob expiration with versioning
- SAS URIs for specific blob versions
- Version-level immutability policies (Version Level WORM)

### VS Code Extension Support

Similar configuration options are available in the VS Code extension settings:

- `azurite.accountConfigFilePath` - Path to account configuration file
- `azurite.accountConfigAsJson` - Inline JSON configuration string

## Azure Documentation on Blob Versioning

This implementation follows the Azure Blob Storage versioning specification as documented in the official Microsoft documentation:

- [Blob versioning overview](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview)
- [Enable and manage blob versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-enable)

The design aligns with Azure's behavior where:

- Versioning is a storage account-level setting
- Version IDs are automatically assigned timestamps
- Previous versions are immutable
- The current version is mutable
