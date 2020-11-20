import { AnnotationLevel } from "./EntityProperty";

export enum EdmType {
  "Binary",
  "Boolean",
  "DateTime",
  "Double",
  "Guid",
  "Int32",
  "Int64",
  "String",
  "Null"
}

export interface IEdmType {
  toJsonPropertyValuePair(
    name: string
  ): [string, string | number | boolean] | undefined;
  toJsonPropertyValueString(name: string): string | undefined;
  toJsonPropertyTypePair(
    name: string,
    annotationLevel: AnnotationLevel,
    isSystemProperty: boolean,
    force?: boolean
  ): [string, string] | undefined;
  toJsonPropertyTypeString(
    name: string,
    annotationLevel: AnnotationLevel,
    isSystemProperty: boolean
  ): string | undefined;
}

export function getEdmType(type: string): EdmType {
  switch (type) {
    case "Edm.Binary":
      return EdmType.Binary;
    case "Edm.Boolean":
      return EdmType.Boolean;
    case "Edm.DateTime":
      return EdmType.DateTime;
    case "Edm.Double":
      return EdmType.Double;
    case "Edm.Guid":
      return EdmType.Guid;
    case "Edm.Int32":
      return EdmType.Int32;
    case "Edm.Int64":
      return EdmType.Int64;
    case "Edm.String":
      return EdmType.String;
    case "Edm.Null":
      return EdmType.Null;
    default:
      throw TypeError(`${type} is not a valid Edm Type.`);
  }
}
