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
    this.typedValue = EdmDateTime.validate(value);
  }

  public toJsonPropertyValuePair(name: string): [string, string] {
    return [name, this.value];
  }

  public toJsonPropertyValueString(name: string): string {
    return `"${name}":"${this.value}"`;
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
