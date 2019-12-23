# Breaking Changes

> Note. This file includes breaking changes after 3.0.0-preview. For legacy Azurite changes, please goto GitHub [releases](https://github.com/Azure/Azurite/releases).

# Incoming Release

- [Breaking] Apply LokiFsStructuredAdapter as default blob metadata loki adapter to improve performance.
  - This version cannot guarantee compatible with persisted database models file by previous version. Remove previous metadata file and restart Azurite in case any errors.

# 2019.11 Version 3.3.0-preview

- [Breaking] This version cannot guarantee compatible with persisted database models file by previous version. Remove previous metadata file and restart Azurite in case any errors.