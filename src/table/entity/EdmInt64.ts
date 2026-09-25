import { ODATA_TYPE } from "../utils/constants";
import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

const EDM_INT64_MIN = -9223372036854775808n;
const EDM_INT64_MAX = 9223372036854775807n;

export class EdmInt64 implements IEdmType {
  public static validate(value: any, validateRange: boolean = true): string {
    if (typeof value !== "string") {
      throw TypeError(`Not a valid EdmInt64 string.`);
    }

    if (!/^[+-]?\d+$/.test(value)) {
      throw TypeError(`Not a valid EdmInt64 string.`);
    }

    const parsedValue = BigInt(value);
    if (
      validateRange &&
      (parsedValue < EDM_INT64_MIN || parsedValue > EDM_INT64_MAX)
    ) {
      throw RangeError(`EdmInt64 value is outside the supported range.`);
    }

    return value;
  }

  public typedValue: string;

  public constructor(public value: any, validateRange: boolean = true) {
    this.typedValue = EdmInt64.validate(value, validateRange);
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
    if (isSystemProperty) {
      throw RangeError(`EdmInt64 type shouldn't be a system property.`);
    }

    if (
      annotationLevel === AnnotationLevel.MINIMAL ||
      annotationLevel === AnnotationLevel.FULL
    ) {
      return [`${name}${ODATA_TYPE}`, "Edm.Int64"];
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
