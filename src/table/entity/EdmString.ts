import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmString implements IEdmType {
  public static validate(value: any): string {
    if (typeof value !== "string") {
      throw TypeError(`Not a valid string.`);
    }

    // TODO: Check GUID string format

    return value;
  }

  public typedValue: string;

  public constructor(public value: any) {
    this.typedValue = EdmString.validate(value);
  }

  public toJsonPropertyValuePair(
    name: string
  ): [string, string | number | boolean] {
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
    return;
  }

  public toJsonPropertyTypeString(
    name: string,
    annotationLevel: AnnotationLevel,
    isSystemProperty: boolean
  ): string | undefined {
    return;
  }
}
