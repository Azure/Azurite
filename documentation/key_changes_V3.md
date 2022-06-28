## Features & Key Changes in Azurite V3

### Blob storage features align with Azure Storage API version 2021-08-06 (Refer to support matrix section below)
  - SharedKey/Account SAS/Service SAS/Public Access Authentications/OAuth
  - Get/Set Blob Service Properties
  - Create/List/Delete Containers
  - Create/Read/List/Update/Delete Block Blobs
  - Create/Read/List/Update/Delete Page Blobs
  
### Queue storage features align with Azure Storage API version 2021-08-06 (Refer to support matrix section below)
  - SharedKey/Account SAS/Service SAS/OAuth
  - Get/Set Queue Service Properties
  - Preflight Request
  - Create/List/Delete Queues
  - Put/Get/Peek/Updata/Deleta/Clear Messages
  
### Table storage features align with Azure Storage API version 2021-08-06 (Refer to support matrix section below)
  - SharedKey/Account SAS/Service SAS/OAuth
  - Create/List/Delete Tables
  - Insert/Update/Query/Delete Table Entities
  
### Features **NEW** on V3
  - Built with TypeScript and ECMA native promise and async features
  - New architecture based on TypeScript server generator. Leverage auto generated protocol layer, models, serializer, deserializer and handler interfaces from REST API swagger
  - Flexible structure and architecture, supports customizing handler layer implementation, persistency layer implementation, HTTP pipeline middleware injection
  - Detailed debugging log support, easy bug locating and reporting
  - Works with storage .Net SDK basic and advanced sample
  - SharedKey, AccountSAS, ServiceSAS, OAuth, Public Access authentication support
  - Keep updating with latest Azure Storage API version features (Refer to support matrix)
