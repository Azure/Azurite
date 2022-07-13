## Detailed support matrix:

- Supported Vertical Features
  - CORS and Preflight
  - SharedKey Authentication
  - OAuth authentication
  - Shared Access Signature Account Level
  - Shared Access Signature Service Level (Not support response header override in service SAS)
  - Container Public Access
- Supported REST APIs
  - List Containers
  - Set Service Properties
  - Get Service Properties
  - Get Stats
  - Get Account Information
  - Create Container
  - Get Container Properties
  - Get Container Metadata
  - Set Container Metadata
  - Get Container ACL
  - Set Container ACL
  - Delete Container
  - Lease Container
  - List Blobs
  - Put Blob (Create append blob is not supported)
  - Get Blob
  - Get Blob Properties
  - Set Blob Properties
  - Get Blob Metadata
  - Set Blob Metadata
  - Create Append Blob, Append Block
  - Lease Blob
  - Snapshot Blob
  - Copy Blob (Only supports copy within same Azurite instance)
  - Abort Copy Blob (Only supports copy within same Azurite instance)
  - Copy Blob From URL (Only supports copy within same Azurite instance, only on Loki)
  - Access control based on conditional headers
- Following features or REST APIs are NOT supported or limited supported in this release (will support more features per customers feedback in future releases)

  - SharedKey Lite
  - Delegation SAS
  - Static Website
  - Soft delete & Undelete Blob
  - Incremental Copy Blob
  - Batch
  - Blob Tags
  - Blob Query
  - Blob Versions
  - Blob Last Access Time
  - Concurrent Append
  - Blob Expiry
  - Object Replication Service
  - Put Blob From URL
  - Version Level Worm
  - Sync copy blob by access source with oauth
  - Encryption Scope
  - Get Page Ranges Continuation Token

Latest version supports for **2021-08-06** API version **queue** service.
Detailed support matrix:

- Supported Vertical Features
  - SharedKey Authentication
  - Shared Access Signature Account Level
  - Shared Access Signature Service Level
  - OAuth authentication
- Supported REST APIs
  - List Queues
  - Set Service Properties
  - Get Service Properties
  - Get Stats
  - Preflight Queue Request
  - Create Queue
  - Get Queue Metadata
  - Set Queue Metadata
  - Get Queue ACL
  - Set Queue ACL
  - Delete Queue
  - Put Message
  - Get Messages
  - Peek Messages
  - Delete Message
  - Update Message
  - Clear Message
- Following features or REST APIs are NOT supported or limited supported in this release (will support more features per customers feedback in future releases)
  - SharedKey Lite
  - Delegation SAS

Latest version supports for **2021-08-06** API version **table** service (preview).
Detailed support matrix:

- Supported Vertical Features
  - SharedKeyLite Authentication
  - SharedKey Authentication
  - Shared Access Signature Account Level
  - Shared Access Signature Service Level
- Supported REST APIs
  - List Tables
  - Create Table
  - Delete Table
  - Update Entity
  - Query Entities
  - Merge Entity
  - Delete Entity
  - Insert Entity
  - Batch
- Following features or REST APIs are NOT supported or limited supported in this release (will support more features per customers feedback in future releases)
  - Set Service Properties
  - Get Service Properties
  - Get Table ACL
  - Set Table ACL
  - Get Stats
  - CORS
  - Batch Transaction
  - Query with complex conditions
  - OAuth

