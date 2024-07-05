import { Entity } from "../persistence/ITableMetadataStore";
import {
  FULL_METADATA_ACCEPT,
  MINIMAL_METADATA_ACCEPT,
  NO_METADATA_ACCEPT
} from "../utils/constants";
import { EdmBinary } from "./EdmBinary";
import { EdmBoolean } from "./EdmBoolean";
import { EdmDateTime } from "./EdmDateTime";
import { EdmDouble } from "./EdmDouble";
import { EdmGuid } from "./EdmGuid";
import { EdmInt32 } from "./EdmInt32";
import { EdmInt64 } from "./EdmInt64";
import { EdmNull } from "./EdmNull";
import { EdmString } from "./EdmString";
import { EdmType, getEdmType, IEdmType } from "./IEdmType";

export enum AnnotationLevel {
  "FULL",
  "MINIMAL",
  "NO"
}

export function toAnnotationLevel(level: string): AnnotationLevel {
  switch (level) {
    case MINIMAL_METADATA_ACCEPT:
      return AnnotationLevel.MINIMAL;
    case FULL_METADATA_ACCEPT:
      return AnnotationLevel.FULL;
    case NO_METADATA_ACCEPT:
      return AnnotationLevel.NO;
    default:
      throw TypeError(`Invalid OData annotation level ${level}.`);
  }
}

export class EntityProperty {
  public constructor(
    public name: string,
    public value: any,
    public edmType: IEdmType,
    public isSystemProperty: boolean = false
  ) {}

  public toJsonPropertyValuePair():
    | [string, string | boolean | number]
    | undefined {
    return this.edmType.toJsonPropertyValuePair(this.name);
  }

  public toJsonPropertyValueString(): string | undefined {
    return this.edmType.toJsonPropertyValueString(this.name);
  }

  public toJsonPropertyTypePair(
    annotationLevel: AnnotationLevel,
    force: boolean = false
  ): [string, string] | undefined {
    return this.edmType.toJsonPropertyTypePair(
      this.name,
      annotationLevel,
      this.isSystemProperty,
      force
    );
  }

  public toJsonPropertyTypeString(
    annotationLevel: AnnotationLevel
  ): string | undefined {
    return this.edmType.toJsonPropertyTypeString(
      this.name,
      annotationLevel,
      this.isSystemProperty
    );
  }

  public toResponseString(
    annotationLevel: AnnotationLevel | string
  ): string | undefined {
    const level =
      typeof annotationLevel === "string"
        ? toAnnotationLevel(annotationLevel)
        : annotationLevel;

    const typeString = this.toJsonPropertyTypeString(level);
    const propertyString = this.toJsonPropertyValueString();

    if (typeString) {
      return [typeString, propertyString].join(",");
    } else {
      return propertyString;
    }
  }

  public normalize(entity: Entity): void {
    // Set back to Entity
    const pair = this.toJsonPropertyValuePair();
    if (!pair) {
      return;
    }

    const [key, value] = pair;
    entity.properties[key] = value;

    const res = this.toJsonPropertyTypePair(AnnotationLevel.FULL, true);
    if (res) {
      const [typeKey, typeValue] = res;
      entity.properties[typeKey] = typeValue;
    }
  }
}

export function parseEntityProperty(
  name: string,
  value: any,
  edmType?: EdmType | string,
  isSystemProperty: boolean = false
): EntityProperty {
  if (edmType !== undefined) {
    // Validate values per input EdmType
    const type = typeof edmType === "string" ? getEdmType(edmType) : edmType;
    switch (type) {
      case EdmType.Binary:
        // EdmBinary.validate(value);
        return new EntityProperty(
          name,
          value,
          new EdmBinary(value),
          isSystemProperty
        );
      case EdmType.Boolean:
        // EdmBoolean.validate(value);
        return new EntityProperty(
          name,
          value,
          new EdmBoolean(value),
          isSystemProperty
        );
      case EdmType.DateTime:
        EdmDateTime.validate(value);
        return new EntityProperty(
          name,
          value,
          new EdmDateTime(value),
          isSystemProperty
        );
      case EdmType.Double:
        const dblval = EdmDouble.validate(value);
        return new EntityProperty(
          name,
          dblval,
          new EdmDouble(dblval),
          isSystemProperty
        );
      case EdmType.Guid:
        EdmGuid.validate(value);
        return new EntityProperty(
          name,
          value,
          new EdmGuid(value),
          isSystemProperty
        );
      case EdmType.Int32:
        EdmInt32.validate(value);
        return new EntityProperty(
          name,
          value,
          new EdmInt32(value),
          isSystemProperty
        );
      case EdmType.Int64:
        EdmInt64.validate(value);
        return new EntityProperty(
          name,
          value,
          new EdmInt64(value),
          isSystemProperty
        );
      case EdmType.String:
        EdmString.validate(value);
        return new EntityProperty(
          name,
          value,
          new EdmString(value),
          isSystemProperty
        );
      default:
        throw TypeError(`Invalid EdmType ${type}.`);
    }
  } else {
    // Extract type from value type
    switch (typeof value) {
      case "string":
        EdmString.validate(value);
        return new EntityProperty(name, value, new EdmString(value));
      case "number":
        if (Number.isInteger(value)) {
          EdmInt32.validate(value);
          return new EntityProperty(name, value, new EdmInt32(value));
        } else {
          EdmDouble.validate(value);
          return new EntityProperty(name, value, new EdmDouble(value));
        }
      case "boolean":
        EdmBoolean.validate(value);
        return new EntityProperty(name, value, new EdmBoolean(value));
      case "object":
        if (value === null) {
          return new EntityProperty(name, value, new EdmNull(value));
        }
      default:
        throw TypeError(`Invalid value when parsing EdmType ${value}.`);
    }
  }
}
