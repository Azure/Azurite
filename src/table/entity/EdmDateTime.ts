import { ODATA_TYPE } from "../utils/constants";
import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

// Accepted ISO 8601 formats: https://learn.microsoft.com/en-us/rest/api/storageservices/formatting-datetime-values
const EDM_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?(Z|([+-])(\d{2}):(\d{2}))?)?$/;
const EDM_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Supported range is 1601-01-01T00:00:00Z through 9999-12-31T23:59:59.9999999Z.
// Both bounds fall on whole seconds, so fractional seconds never affect the comparison.
const EDM_DATETIME_MIN = Date.UTC(1601, 0, 1);
const EDM_DATETIME_MAX_EXCLUSIVE = Date.UTC(10000, 0, 1);

export class EdmDateTime implements IEdmType {
  public static validate(value: any, validateRange: boolean = true): string {
    if (typeof value !== "string") {
      throw TypeError(`Not a valid EdmDateTime string.`);
    }

    // Values read back from storage are returned as stored, without format or range checks
    if (!validateRange) {
      return value;
    }

    const match = EDM_DATETIME_PATTERN.exec(value);
    if (!match) {
      throw TypeError(`Not a valid EdmDateTime string.`);
    }

    const [, year, month, day, hour = "00", minute = "00", second = "00"] =
      match;
    const [offsetSign, offsetHours, offsetMinutes] = match.slice(8);
    const dateTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const parsed = new Date(`${dateTime}Z`);
    if (
      isNaN(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 19) !== dateTime ||
      (offsetHours !== undefined &&
        (Number(offsetHours) > 23 || Number(offsetMinutes) > 59))
    ) {
      throw TypeError(`Not a valid EdmDateTime string.`);
    }

    const offset =
      offsetSign === undefined
        ? 0
        : (offsetSign === "-" ? -1 : 1) *
          (Number(offsetHours) * 60 + Number(offsetMinutes)) *
          60000;
    const utc = parsed.valueOf() - offset;
    if (utc < EDM_DATETIME_MIN || utc >= EDM_DATETIME_MAX_EXCLUSIVE) {
      throw RangeError(`EdmDateTime value is outside the supported range.`);
    }

    return value;
  }

  public typedValue: string;

  public constructor(public value: any, validateRange: boolean = true) {
    this.typedValue = EdmDateTime.validate(value, validateRange);

    // Azure Server will take time string like "2012-01-02T23:00:00" as UTC time, so Azurite need be aligned by adding suffix "Z"
    // A date-only value like "2012-01-02" is midnight UTC on that date
    const utcTimeString =
      (EDM_DATE_ONLY_PATTERN.test(value) ? `${value}T00:00:00` : value) + "Z";
    const utcTime: Date = new Date(utcTimeString);
    if (!isNaN(utcTime.getDay())) {
      // When add suffix "Z" is still a validate date string, use the string with suffix "Z"; else use original string
      this.typedValue = utcTimeString;
    }
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
    if (
      annotationLevel === AnnotationLevel.MINIMAL ||
      annotationLevel === AnnotationLevel.FULL
    ) {
      if (annotationLevel === AnnotationLevel.MINIMAL && isSystemProperty) {
        return;
      }
      return [`${name}${ODATA_TYPE}`, "Edm.DateTime"];
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
