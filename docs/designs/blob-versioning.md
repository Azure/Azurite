# Blob Versioning

Tracking issue: [#665](https://github.com/Azure/Azurite/issues/665)

Reference behaviour: [Blob versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview)

## Summary

When blob versioning is enabled for an account, every write to a blob preserves the
previous content as a read-only *version* identified by a version ID. The version ID is
an RFC 3339 timestamp with 7 digit fractional seconds, for example
`2026-08-12T10:00:00.0000000Z`.

## How versioning is enabled

Azure Storage configures versioning through the **ARM management plane**
(`Microsoft.Storage/storageAccounts/blobServices/default`, property
`isVersioningEnabled`). It is not part of the data plane REST API that Azurite
emulates - `Set Blob Service Properties` has no `Versioning` element, and adding one
would mean emulating an API that does not exist in the real service.

Azurite has no management plane, so account level settings are supplied at start up
instead, with two mutually exclusive options:

```bash
# From a file
azurite --accountConfigFile ./myAccountConfig.json

# Inline
azurite --accountConfig '{"accounts":[{"name":"devstoreaccount1","blobService":{"isVersioningEnabled":true}}]}'
```

`./myAccountConfig.json`:

```json
{
  "accounts": [
    {
      "name": "devstoreaccount1",
      "blobService": {
        "isVersioningEnabled": true
      }
    }
  ]
}
```

A single account may also be supplied directly, without the `accounts` wrapper:

```json
{ "name": "devstoreaccount1", "blobService": { "isVersioningEnabled": true } }
```

Account names are matched case insensitively. An account that is not listed uses the
defaults, which is versioning disabled - so this configuration only ever opts accounts
in, it never changes behaviour for accounts you did not mention. This composes with
[customized storage accounts](../../README.md#customized-storage-accounts--keys): list
each account that needs versioning in the configuration.

The resolved configuration is written to the debug log at start up, so an Azurite issue
report shows which account settings were actually in effect.

### Changing the setting on an existing workspace

Versioning changes how writes are persisted, so switching it on or off against a
workspace that already contains blobs would leave the metadata store in a state that
matches neither setting. The configuration is therefore persisted in the metadata store
and reconciled at start up:

1. Read the configuration persisted by the previous run.
2. Compare it with the configuration supplied on the command line.
3. If there is no conflict, run with the previous configuration merged with the new
   input, and persist the result.
4. If there is a conflict, fail at start up with a message naming the account.

To flip the setting, start Azurite against a clean workspace (a different `--location`,
or remove the existing one).

## Data model

Versions live in the same Loki collection as the blob they belong to
(`$BLOBS_COLLECTION$`), keyed by `accountName`, `containerName`, `name`, `snapshot` and
`versionId`. Exactly one document per blob has `isCurrentVersion: true`, or none once the
current version has been deleted.

Blobs written before versioning was enabled have no `versionId` and no
`isCurrentVersion` field. Every query that means "the blob itself" therefore matches
`isCurrentVersion: { $ne: false }` rather than `isCurrentVersion: true`, so those blobs
continue to resolve.

Account configuration lives in its own collection (`$ACCOUNTS_COLLECTION$`) rather than
alongside blob documents, so that the queue and table services can reuse it when they
need account level settings.

### List continuation tokens

A blob name is not a sufficient continuation token once versions exist, because every
version of a blob shares its name - resuming from a name alone would skip the remaining
versions of the blob the previous page stopped inside. Tokens therefore carry a secondary
key (the version ID) alongside the name.

Tokens without a secondary key keep Azurite's historical format, the plain blob name, so
listings that do not involve versions are unchanged and tokens issued by earlier versions
of Azurite remain valid. Anything not recognizable as a composite token is interpreted as
a plain blob name.

## Behaviour

Which operations create a version follows the reference behaviour: for block blobs every
write except Put Block, and for page and append blobs only Put Blob, Put Block List, Set
Blob Metadata and Copy Blob.

| Operation | Behaviour with versioning enabled |
| --- | --- |
| Put Blob, Put Block List, Copy Blob | Overwriting retains the previous content as a version; the response carries `x-ms-version-id` |
| Page Blob Create, Append Blob Create | Creates a version and returns `x-ms-version-id` |
| Put Page, Append Block | Do **not** create a version, matching the reference behaviour for page and append blobs |
| Set Blob Metadata | Creates a version for every blob type and returns `x-ms-version-id` |
| Set Blob Properties | Creates a version for block blobs only. No `x-ms-version-id` is returned, because the storage swagger does not declare that header on this operation |
| Snapshot Blob | Creates a snapshot **and** a new current version, returning both `x-ms-snapshot` and `x-ms-version-id` |
| Get Blob Tags, Set Blob Tags | Accept `?versionid=`, so tags are addressable per version |
| Set Blob Tier | Accepts `?versionid=`, so any version can be tiered independently |
| Malformed `?versionid=` | 400 `InvalidQueryParameterValue`, rather than 404 |
| Get Blob, Get Blob Properties | `?versionid=` addresses one version; without it the current version is addressed. `x-ms-is-current-version: true` is returned only for the current version |
| List Blobs | `include=versions` returns previous versions with `VersionId` and `IsCurrentVersion`; they are hidden otherwise. Versions of the same blob are ordered oldest first, current last |
| Delete Blob with `?versionid=` | Deletes just that version; `x-ms-delete-snapshots` cannot be combined with it |
| Delete Blob without `?versionid=` | The current version becomes a previous version and is retained, and the blob has no current version. Previous versions persist, and it does **not** fail with `SnapshotsPresent` because versions exist. `HasVersionsOnly` is reported for a blob in that state |
| Snapshots | Continue to work as before, and still block deleting the base blob with `SnapshotsPresent`. Using versioning and snapshots together is supported but, as in production, not recommended |
| Write after Delete Blob | Creates a new current version; existing versions are unaffected |
| Restore a version | No dedicated API: copy the version over the current version, `Copy Blob` with a `?versionid=` qualified source |
| `?snapshot=` and `?versionid=` together | 400 `InvalidQueryParameterValue` |

## Not implemented

These are deliberately out of scope, and are tracked separately rather than partially
emulated:

- **SQL metadata store.** Versioning is implemented for the Loki store only. Configuring
  versioning together with `AZURITE_DB` fails at start up, and a request carrying
  `versionid` against the SQL store returns a not-implemented error rather than silently
  reading the current version.
- **Blob soft delete**, which Azurite does not support at all, so none of the
  soft-delete/versioning interactions (`include=deletedwithversions`, `HasVersionsOnly`,
  permanent delete) are emulated.
- **Blob version SAS.** Azurite supports SAS in general, but the `x` (delete version)
  permission and the `sr=bv` (blob version) signed resource are not implemented, so a SAS
  cannot be used to address a specific version.
- **Get Block List** and **Get Page Ranges** with a version ID. The current storage
  swagger does not define `versionid` on either operation, matching Azure.
- **Verification against a real storage account.** The behaviour here is implemented from
  the reference documentation and the storage swagger, not confirmed against a live
  account, so a parity test pass against real Azure is still worth doing.
- **Blob expiration** and object replication interactions.
