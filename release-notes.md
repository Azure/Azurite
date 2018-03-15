# 2.0
## 2.5.0
- support for UpdateEntity [#136](https://github.com/arafato/azurite/issues/136)
## 2.4.1
- fixes [#165](https://github.com/arafato/azurite/issues/165): Blob: ETag is properly enclosed in escaped double parenthesis
## 2.4.0
- support for QueryEntities [#132](https://github.com/arafato/azurite/issues/132)
## 2.3.0
- support for QueryTable [#133](https://github.com/arafato/azurite/issues/133)
    - thanks to @tlycken for various bugfixes (see PR @ https://github.com/arafato/azurite/pull/163)
## 2.2.2
- fixes [#160](https://github.com/arafato/azurite/issues/160): adds working $root container semantics
- fixes [#155](https://github.com/arafato/azurite/issues/155): Improvements in Azure Storage Explorer integration (Blob Storage)
## 2.2.1
- added table support in package.json
## 2.2.0
- support for DeleteEntity [#138](https://github.com/arafato/azurite/issues/138)
## 2.1.0
- support for InsertEntity [#131](https://github.com/arafato/azurite/issues/131)
- support for DeleteTable [#130](https://github.com/arafato/azurite/issues/130)
## 2.0.0
- Initial support for Table Storage: 
    - technical base work [#141](https://github.com/arafato/azurite/issues/141)
    - Support for CreateTable [#129](https://github.com/arafato/azurite/issues/129)
- fixes [#157](https://github.com/arafato/azurite/issues/157): Blob Storage Bugfix in CopyBlob (again)
# 1.0
## 1.9.3
- fixes [#157](https://github.com/arafato/azurite/issues/157): Blob Storage Bugfix in CopyBlob
## 1.9.2
- fixes [#158](https://github.com/arafato/azurite/issues/158): Blob Storage Bugfix
## 1.9.1
- fixes [#159](https://github.com/arafato/azurite/issues/159): Blob Storage Bugfix
## 1.9.0
- fixes [#156](https://github.com/arafato/azurite/issues/156): Blob Storage Featre: Support for Get/Set StorageServiceProperties, Preflight Request, and CORS Support
## 1.8.6
- merged PR https://github.com/arafato/azurite/pull/153 -> thanks to @jamesrichford 
- merged PR https://github.com/arafato/azurite/pull/151 -> thanks to @jamesrichford 
## 1.8.5
- fixes [#149](https://github.com/arafato/azurite/issues/149): -> thanks a lot to @kautsig for proposing an initial solution in [PR 147](https://github.com/arafato/azurite/pull/147)
- merged PR https://github.com/arafato/azurite/pull/148 -> thanks to @Nighthawk22 
## 1.8.3
- fixes [#144](https://github.com/arafato/azurite/issues/144): Blob Storage Bugfix: Wrong offset calculation for continuation token
## 1.8.2
- fixes [#142](https://github.com/arafato/azurite/issues/142): Blob Storage Bugfix
## 1.8.1
- fixes [#128](https://github.com/arafato/azurite/pull/128): Queue: Adds support for Queue Length in metadata -> thanks to @leafnode for PR!
- fixes [#16](https://github.com/arafato/azurite/issues/126): Optimized launch configuration, improved README, improved unsupported route handling -> thanks to @liamdawson for PR!
## 1.8.0
- fixes [#100](https://github.com/arafato/azurite/issues/124): Queue: Adds support for Set Queue ACL
- fixes [#99](https://github.com/arafato/azurite/issues/124): Queue: Adds support for Get Queue ACL
## 1.7.2
- removed typo (see comment at https://github.com/arafato/azurite/commit/78ac258550232fd801a3184aee2286ed3469bfd4#commitcomment-26027432)
## 1.7.1
- fixes [#124](https://github.com/arafato/azurite/issues/124): Blob Storage Bugfix
## 1.7.0
- fixes [#60](https://github.com/arafato/azurite/issues/60): Blob: Added support for servic-level Shared Access Signatures
## 1.6.1
- fixes [#123](https://github.com/arafato/azurite/issues/123): Blob Storage Bugfix
- fixes [#122](https://github.com/arafato/azurite/issues/122): Blob Storage Bugfix
## 1.6.0
- fixes [#121](https://github.com/arafato/azurite/issues/121): Queue Storage: Adds support for ListQueues
- fixes [#97](https://github.com/arafato/azurite/issues/97): Queue Storage: Adds support for GetQueueMetadata
- fixes [#119](https://github.com/arafato/azurite/issues/119): Queue Storage
## 1.5.1
- fixes [#118](https://github.com/arafato/azurite/issues/118): Queue Storage
- fixes [#117](https://github.com/arafato/azurite/issues/117): Queue Storage
- fixes [#116](https://github.com/arafato/azurite/issues/116): Queue Storage
- fixes [#115](https://github.com/arafato/azurite/issues/115): Queue Storage
## 1.5.0
- fixes [#106](https://github.com/arafato/azurite/issues/106): Queue Storage: Adds support for UpdateMessage
## 1.4
- fixes [#104](https://github.com/arafato/azurite/issues/104): Queue Storage: Adds support for DeleteMessage
## 1.3
### 1.3.1
- fixes [#103](https://github.com/arafato/azurite/issues/103): Queue Storage: Adds support for PeekMessages
- fixes [#105](https://github.com/arafato/azurite/issues/105): Queue Storage: Adds support for ClearMessages
- fixes [#102](https://github.com/arafato/azurite/issues/102): Queue Storage: Adds support for GetMessages
- fixes [#101](https://github.com/arafato/azurite/issues/101): Queue Storage: Adds support for PutMessage
### 1.3.0
- fixes [#110](https://github.com/arafato/azurite/issues/110): fixed require directive for QueueManager
- fixes [#107](https://github.com/arafato/azurite/issues/110): high idle load
## 1.2.0
- fixes [#98](https://github.com/arafato/azurite/issues/98): Added support for SetQueueMetadata
## 1.1.0
- fixes [#96](https://github.com/arafato/azurite/issues/96): Added support for DeleteQueue
## 1.0.0
- architectural changes to support different storage services such as queues, files, tables
- support for queues started [#96](https://github.com/arafato/azurite/issues/96): support for CreateQueue

# 0.10
## 0.10.2
- fixes [#95](https://github.com/arafato/azurite/issues/95)
## 0.10.1
- fixes [#93](https://github.com/arafato/azurite/issues/93)
- fixes [#92](https://github.com/arafato/azurite/issues/92)
- fixes [#91](https://github.com/arafato/azurite/issues/91)
## 0.10.0
- initial support for Copy Blob and Abort Copy Blob [#63](https://github.com/arafato/azurite/issues/63)

# 0.9
## 0.9.16
- fixes [#90](https://github.com/arafato/azurite/issues/90)
## 0.9.15
- fixes [#86](https://github.com/arafato/azurite/issues/86)
- fixes [#87](https://github.com/arafato/azurite/issues/87)
- fixes [#88](https://github.com/arafato/azurite/issues/88)
- fixes [#89](https://github.com/arafato/azurite/issues/89)
## 0.9.14
- fixes [#85](https://github.com/arafato/azurite/issues/85): append block on non-existing blob does not crash anymore
## 0.9.13
- fixes [#84](https://github.com/arafato/azurite/issues/84): changed CRLF line endings to LF to make Azurite run on *nix OS
## 0.9.12
- fixes the fixes [#83](https://github.com/arafato/azurite/issues/83): ListBlobs delimiter is really working now
## 0.9.11
- fixes [#83](https://github.com/arafato/azurite/issues/83): ListBlobs delimiter is working now
## 0.9.10
- Azurite now uses a flat base64-encoded file hierarchy, see [#82](https://github.com/arafato/azurite/issues/82): 