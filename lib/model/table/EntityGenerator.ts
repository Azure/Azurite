import computeEtag from "../../core/utils";

const _baseUrl = `http://127.0.0.1:10002/devstoreaccount1/`;

/**
 * Generates a Table Storage "Table" entity and a Table Storage "Entity" entity.
 *
 * @class TableGenerator
 */
class EntityGenerator {
  /**
   * Generates a persistable table storage "Table" entity representation.
   *
   * @param {any} name of the table
   * @returns
   * @memberof TableGenerator
   */
  public generateTable(name) {
    return {
      name,
      odata: {
        editLink: `Tables("${name}")`,
        id: `${_baseUrl}Tables("${name}")`,
        metadata: `${_baseUrl}$metadata#Tables/@Element`,
        type: `devstoreaccount1.Tables`
      }
    };
  }

  public generateEntity(rawEntity, tableName) {
    // Enriching raw entity from payload with odata attributes
    const entity = {
      attribs: {
        Timestamp: new Date().toISOString()
      },
      odata: undefined,
      partitionKey: rawEntity.PartitionKey,
      rowKey: rawEntity.RowKey
    };

    entity.attribs["Timestamp@odata.type"] = "Edm.DateTime";

    for (const key of Object.keys(rawEntity)) {
      if (key === "PartitionKey" || key === "RowKey" || key === "Timestamp") {
        continue;
      }
      entity.attribs[key] = rawEntity[key];
    }

    entity.odata = {};
    entity.odata.metadata = `${_baseUrl}${tableName}$metadata#${tableName}/@Element`;
    entity.odata.type = `devstoreaccount1.${tableName}`;
    entity.odata.id = `${_baseUrl}${tableName}(PartitionKey="${
      rawEntity.PartitionKey
    }",RowKey="${rawEntity.RowKey}")`;
    entity.odata.editLink = `${tableName}(PartitionKey="${
      rawEntity.PartitionKey
    }",RowKey="${rawEntity.RowKey}")`;
    entity.odata.etag = computeEtag(JSON.stringify(rawEntity));
    return entity;
  }
}

export default new EntityGenerator();
