import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmNull implements IEdmType {
  public static validate(value: any): void {
    if (typeof value !== "object" && value !== null) {
      throw TypeError(`Not a valid EdmNull string.`);
    }
  }

  public constructor(public value: any) {
    EdmNull.validate(value);
  }

  public toJsonPropertyValuePair(
    name: string
  ): [string, string | number | boolean] | undefined {
    return;
  }

  public toJsonPropertyValueString(name: string): string | undefined {
    return;
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
