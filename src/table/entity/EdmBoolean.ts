import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmBoolean implements IEdmType {
  public static validate(value: any): boolean {
    if (typeof value !== "boolean") {
      throw TypeError(`Not a valid EdmBoolean string.`);
    }

    return value;
  }

  public typedValue: boolean;

  public constructor(public value: any) {
    this.typedValue = EdmBoolean.validate(value);
  }

  public toJsonPropertyValuePair(name: string): [string, boolean] {
    return [name, this.typedValue];
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
