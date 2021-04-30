import { ODATA_TYPE } from "../utils/constants";
import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmDateTime implements IEdmType {
  public static validate(value: any): string {
    if (typeof value !== "string") {
      throw TypeError(`Not a valid EdmDateTime string.`);
    }

    // TODO: Check data time string format

    return value;
  }

  public typedValue: string;

  public constructor(public value: any) {
    // Azure Server will take time string like "2012-01-02T23:00:00" as UTC time, so Azurite need be aligned by adding suffix "Z"
    const utcTimeString = value + "Z";
    const utcTime: Date = new Date(value + "Z");
    if (!isNaN(utcTime.getDay())) {
      // When add suffix "Z" is still a validate date string, use the string with suffix "Z"; else use original string
      this.typedValue = utcTimeString;
    } else {
      this.typedValue = EdmDateTime.validate(value);
    }
  }

  public toJsonPropertyValuePair(name: string): [string, string] {
    return [name, this.typedValue];
  }

  public toJsonPropertyValueString(name: string): string {
    return `"${name}":${JSON.stringify(this.typedValue)}`;
  }

  public toJsonPropertyTypePair(
    name: string,
    annotationLevel: AnnotationLevel,
    isSystemProperty: boolean
  ): [string, string] | undefined {
    if (
      annotationLevel === AnnotationLevel.MINIMAL ||
      annotationLevel === AnnotationLevel.FULL
    ) {
      if (annotationLevel === AnnotationLevel.MINIMAL && isSystemProperty) {
        return;
      }
      return [`${name}${ODATA_TYPE}`, "Edm.DateTime"];
    }
  }

  public toJsonPropertyTypeString(
    name: string,
    annotationLevel: AnnotationLevel,
    isSystemProperty: boolean
  ): string | undefined {
    const res = this.toJsonPropertyTypePair(
      name,
      annotationLevel,
      isSystemProperty
    );
    if (!res) {
      return;
    }

    const [key, value] = res;
    return `"${key}":"${value}"`;
  }
}
