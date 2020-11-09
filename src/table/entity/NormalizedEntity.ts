import { Entity } from "../persistence/ITableMetadataStore";
import { ODATA_TYPE } from "../utils/constants";
import { getTimestampString } from "../utils/utils";
import { EdmString } from "./EdmString";
import { EntityProperty, parseEntityProperty } from "./EntityProperty";
// import { EdmType } from "./IEdmType";

export class NormalizedEntity {
  public ref: Entity;
  public properties: EntityProperty[] = [];
  public propertiesMap: { [property: string]: EntityProperty } = {};

  public constructor(entity: Entity) {
    this.ref = entity;

    // Partition Key
    const partitionKeyProperty = new EntityProperty(
      "PartitionKey",
      entity.PartitionKey,
      new EdmString(entity.PartitionKey),
      true
    );
    this.properties.push(partitionKeyProperty);
    this.propertiesMap.PartitionKey = partitionKeyProperty;

    // Row Key
    const rowKeyProperty = new EntityProperty(
      "RowKey",
      entity.RowKey,
      new EdmString(entity.RowKey),
      true
    );
    this.properties.push(rowKeyProperty);
    this.propertiesMap.RowKey = rowKeyProperty;

    // Sync Timestamp from entity last modified time
    entity.properties.Timestamp = getTimestampString(entity.lastModifiedTime);
    entity.properties["Timestamp@odata.type"] = "Edm.DateTime";

    for (const key in entity.properties) {
      if (Object.prototype.hasOwnProperty.call(entity.properties, key)) {
        const element = entity.properties[key];
        if (this.propertiesMap[key] !== undefined) {
          continue;
        }

        if (key.endsWith(ODATA_TYPE)) {
          continue;
        } else {
          const type = entity.properties[`${key}${ODATA_TYPE}`];
          if (type !== undefined && typeof type !== "string") {
            throw RangeError(
              `Invalid EdmType value:${type} for key:${key}${ODATA_TYPE}`
            );
          }
          const property = parseEntityProperty(key, element, type, false);
          this.properties.push(property);
          this.propertiesMap[key] = property;
        }
      }
    }
  }

  // Convert to HTTP response payload string
  public toResponseString(
    annotationLevel: string,
    injections: { [property: string]: string }
  ): string {
    const pairs: string[] = [];
    for (const key in injections) {
      if (Object.prototype.hasOwnProperty.call(injections, key)) {
        const value = injections[key];
        pairs.push(`"${key}":${JSON.stringify(value)}`);
      }
    }

    for (const pair of this.properties) {
      pairs.push(pair.toResponseString(annotationLevel));
    }

    return `{${pairs.join(",")}}`;
  }

  public normalize(): Entity {
    this.ref.properties = {};
    for (const entity of this.properties) {
      entity.normalize(this.ref);
    }
    return this.ref;
  }
}
