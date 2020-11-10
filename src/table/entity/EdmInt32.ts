import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmInt32 implements IEdmType {
  public static validate(value: any): number {
    if (typeof value !== "number") {
      throw TypeError(`Not a valid EdmInt32 string.`);
    }

    // TODO: Check not an integer

    return value;
  }

  public typedValue: number;

  public constructor(public value: any) {
    this.typedValue = EdmInt32.validate(value);
  }

  public toJsonPropertyValuePair(name: string): [string, number] {
    return [name, this.value];
  }

  public toJsonPropertyValueString(name: string): string {
    return `"${name}":${this.value}`;
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
