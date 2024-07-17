# Breaking Changes

> Note. This file includes breaking changes after 3.0.0-preview. For legacy Azurite changes, please goto GitHub [releases](https://github.com/Azure/Azurite/releases).

# 2022.3 Version 3.x.0 (vNext)

- [Breaking] Remove support in table API Azure Pipeline for old node js versions. This means that all table tests will run based on following versions of node js: 14, 16
- [Breaking] Test matrix in Azure Pipeline has removed nodejs 8.
- [Breaking] Batch responses include 3 CRLFs when closing final changesetresponse section to support Go SDK

## 2021.9 Version 3.14.2

- [Breaking] Remove the support of DNS name with multiple blocks but without account name, like "http://foo.bar.com:10000/devstoreaccount1/container".
  - When use DNS name with multiple blocks, storage account name must be in the first block, like "http://devstoreaccount1.blob.localhost:10000/container"

## 2019.12 Version 3.4.0

- [Breaking] By default Azurite will block requests with unsupported headers or parameters which may impact data integrity.
  - Skip this by switching to loose mode by Azurite configuration parameter `--loose`.
- [Breaking] Azurite updates underline metadata schema which does not compatible with previous versions.
  - This version cannot guarantee compatible with persisted database models file by previous version. Remove previous metadata file and restart Azurite in case any errors.

## 2019.11 Version 3.3.0-preview

- [Breaking] This version cannot guarantee compatible with persisted database models file by previous version. Remove previous metadata file and restart Azurite in case any errors.
