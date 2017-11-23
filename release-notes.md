# 1.0
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