import { ODATA_TYPE } from "../utils/constants";
import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmBinary implements IEdmType {
  public static validate(value: any): string {
    if (typeof value !== "string") {
      throw TypeError(`Not a valid EdmBinary string.`);
    }

    // TODO: Check base64

    return value;
  }

  public typedValue: string;

  public constructor(public value: any) {
    this.typedValue = EdmBinary.validate(value);
  }

  public toJsonPropertyValuePair(name: string): [string, string] {
    return [name, this.value];
  }

  public toJsonPropertyValueString(name: string): string {
    return `"${name}":${JSON.stringify(this.typedValue)}`;
  }

  public toJsonPropertyTypePair(
    name: string,
    annotationLevel: AnnotationLevel,
    isSystemProperty: boolean
  ): [string, string] | undefined {
    if (isSystemProperty) {
      throw RangeError(`EdmBinary type shouldn't be a system property.`);
    }

    if (
      annotationLevel === AnnotationLevel.MINIMAL ||
      annotationLevel === AnnotationLevel.FULL
    ) {
      return [`${name}${ODATA_TYPE}`, "Edm.Binary"];
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
