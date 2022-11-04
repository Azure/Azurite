import { truncatedISO8061Date } from "../../common/utils/utils";
import { Entity } from "../persistence/ITableMetadataStore";
import { ODATA_TYPE } from "../utils/constants";
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
    entity.properties.Timestamp =
      typeof entity.lastModifiedTime === "string" &&
      entity.lastModifiedTime === ""
        ? truncatedISO8061Date(new Date(), true, true)
        : entity.lastModifiedTime;
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
          const property = this.validateSystemProperty(key, element, type);
          this.properties.push(property);
          this.propertiesMap[key] = property;
        }
      }
    }
  }

  /**
   * Removes oData type from Timestamp property
   *
   * @private
   * @param {string} key
   * @param {(string | number | boolean | null)} element
   * @param {string} type
   * @return {*}
   * @memberof NormalizedEntity
   */
  private validateSystemProperty(
    key: string,
    element: string | number | boolean | null,
    type: string
  ) {
    let isSystemProperty = false;
    if (key === "Timestamp") {
      isSystemProperty = true;
    }
    const property = parseEntityProperty(key, element, type, isSystemProperty);
    return property;
  }

  // Convert to HTTP response payload string
  public toResponseString(
    annotationLevel: string,
    injections: { [property: string]: string },
    includes?: Set<string>
  ): string {
    const pairs: string[] = [];
    for (const key in injections) {
      if (Object.prototype.hasOwnProperty.call(injections, key)) {
        const value = injections[key];
        pairs.push(`"${key}":${JSON.stringify(value)}`);
      }
    }

    for (const pair of this.properties) {
      if (!includes || includes.has(pair.name)) {
        const str = pair.toResponseString(annotationLevel);
        if (str) {
          pairs.push(str);
        }
      }
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
