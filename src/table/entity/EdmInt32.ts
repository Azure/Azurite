import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmInt32 implements IEdmType {
  public static validate(value: any): number {
    if (typeof value === "string") {
      // we need to check for non-digits other than - in the int string
      // as parseInt will just return the first number it finds
      if (value.toLocaleString().match(/^[+-]?\d+$/)?.length !== 1) {
        throw TypeError(`Not a valid integer.`);
      }
      const intval = parseInt(value, 10);
      if (isNaN(intval)) {
        throw TypeError(`Not a valid EdmInt32 string.`);
      }
      return intval;
    }
    if (typeof value !== "number") {
      throw TypeError(`Not a valid EdmInt32 string.`);
    }

    return value;
  }

  public typedValue: number;

  public constructor(public value: any) {
    this.typedValue = EdmInt32.validate(value);
  }

  public toJsonPropertyValuePair(name: string): [string, number] {
    return [name, this.typedValue];
  }

  public toJsonPropertyValueString(name: string): string {
    return `"${name}":${this.typedValue}`;
  }

  public toJsonPropertyTypePair(
    _name: string,
    _annotationLevel: AnnotationLevel,
    _isSystemProperty: boolean
  ): [string, string] | undefined {
    return;
  }

  public toJsonPropertyTypeString(
    _name: string,
    _annotationLevel: AnnotationLevel,
    _isSystemProperty: boolean
  ): string | undefined {
    return;
  }
}
