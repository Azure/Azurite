# Azurite Server Table

> see https://aka.ms/autorest

```yaml
package-name: azurite-server-table
title: AzuriteServerTable
description: Azurite Server for Table
enable-xml: true
generate-metadata: false
license-header: MICROSOFT_MIT_NO_VERSION
output-folder: ../src/table/generated
input-file: ./table/table.json
model-date-time-as-string: true
optional-response-headers: true
enum-types: true
```

### ApiVersionParameter -> Update to optional

```yaml
directive:
  - from: swagger-document
    where: $.parameters.ApiVersionParameter
    transform: >
      $["required"]= false;
```

### DataServiceVersionParameter -> Update to optional

```yaml
directive:
  - from: swagger-document
    where: $.parameters.DataServiceVersionParameter
    transform: >
      $["required"]= false;
```

### Create Table -> Update response

```yaml
directive:
  - from: swagger-document
    where: $.definitions
    transform: >
      $["TableResponse"]["properties"] = {
        "odata.metadata": {
          "description": "The metadata response of the table.",
          "type": "string"
        },
        "TableName": {
          "description": "The name of the table.",
          "type": "string"
        },
        "odata.type": {
          "description": "The odata type of the table.",
          "type": "string"
        },
        "odata.id": {
          "description": "The id of the table.",
          "type": "string"
        },
        "odata.editLink": {
          "description": "The edit link of the table.",
          "type": "string"
        }
      };
      $["TableResponse"]["allOf"] = undefined;
```

### Update Table_InsertEntity response to file

```yaml
directive:
  - from: swagger-document
    where: $["paths"]["/{table}"].post.responses["201"]
    transform: >
      $.schema = {
        "type": "object",
        "format": "file"
      };
```