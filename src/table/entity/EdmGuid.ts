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

  /**
   * We store GUIDs as base64 encoded strings to stop them being found
   * by simple string searches.
   * We must support backwards compatability, so cover both cases.
   * @param name
   * @returns
   */
  public toJsonPropertyValueString(name: string): string {
    if (EdmGuid.isBase64Encoded(this.value)) {
      const binData = Buffer.from(this.value, "base64");
      const decoded = binData.toString("utf8");
      return `"${name}":${JSON.stringify(decoded)}`;
    }
    return `"${name}":${JSON.stringify(this.value)}`;
  }

  private static isBase64Encoded(value: any) {
    const stringValue: string = value;
    const matches = stringValue.match(
      /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{1}=)?$/
    );
    return (
      matches !== null &&
      matches?.length === 3 &&
      (matches[2] === undefined || matches[2].length === 4)
    );
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

  /**
   * Will return "<propname>@odata.type":"Edm.guid"
   *
   * @param {string} name
   * @param {AnnotationLevel} annotationLevel
   * @param {boolean} isSystemProperty
   * @return {*}  {(string | undefined)}
   * @memberof EdmGuid
   */
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
