import { ODATA_TYPE } from "../utils/constants";
import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmGuid implements IEdmType {
  /**
   * Stores value as base64
   * @param value
   * @returns
   */
  public static validate(value: any): string {
    if (typeof value !== "string") {
      throw TypeError(`Not a valid EdmGuid string.`);
    }

    // TODO: Check GUID string format

    // we need to store GUID in base64 to avoid finding with a string query
    const guidBuff = Buffer.from(value);
    return guidBuff.toString("base64");
  }

  public typedValue: string;

  public constructor(public value: any) {
    this.typedValue = EdmGuid.validate(value);
  }

  public toJsonPropertyValuePair(name: string): [string, string] {
    return [name, this.typedValue];
  }

  public toJsonPropertyValueString(name: string): string {
    const binData = Buffer.from(this.value, "base64");
    const decoded = binData.toString("utf8");
    return `"${name}":${JSON.stringify(decoded)}`;
  }

  public toJsonPropertyTypePair(
    name: string,
    annotationLevel: AnnotationLevel,
    isSystemProperty: boolean
  ): [string, string] | undefined {
    if (isSystemProperty) {
      throw RangeError(`EdmGuid type shouldn't be a system property.`);
    }

    if (
      annotationLevel === AnnotationLevel.MINIMAL ||
      annotationLevel === AnnotationLevel.FULL
    ) {
      return [`${name}${ODATA_TYPE}`, "Edm.Guid"];
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
