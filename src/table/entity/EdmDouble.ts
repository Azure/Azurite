import { ODATA_TYPE } from "../utils/constants";
import { AnnotationLevel } from "./EntityProperty";
import { IEdmType } from "./IEdmType";

export class EdmDouble implements IEdmType {
  public static validate(value: any): number | string {
    if (value === "NaN" || value === "Infinity" || value === "-Infinity") {
      return value;
    }

    if (typeof value === "string") {
      // TODO: Support convert from string. parseFloat doesn't strictly checks non number chars
      const val = Number.parseFloat(value);
      if (!Number.isNaN(val)) {
        // Test on both Product server and Azurite, they are aligned: "1.797693134862315e308" will pass validation, "1.797693134862316e308" will fail validation.
        if (val === Number.POSITIVE_INFINITY || val === Number.NEGATIVE_INFINITY)
        {
          throw TypeError(`InvalidInput`);
        }
        return val;
      }
    }

    if (typeof value !== "number") {
      throw TypeError(`Not a valid EdmDouble string.`);
    }

    return value;
  }

  public typedValue: number | string;

  public constructor(public value: any) {
    this.typedValue = EdmDouble.validate(value);
  }

  public toJsonPropertyValuePair(name: string): [string, number] {
    return [name, this.value];
  }

  public toJsonPropertyValueString(name: string): string {
    if (typeof this.typedValue === "number") {
      return `"${name}":${
        Number.isInteger(this.value) ? this.typedValue.toFixed(1) : this.value
      }`;
    } else {
      return `"${name}":${JSON.stringify(this.typedValue)}`;
    }
  }

  public toJsonPropertyTypePair(
    name: string,
    annotationLevel: AnnotationLevel,
    isSystemProperty: boolean,
    force: boolean = false
  ): [string, string] | undefined {
    if (isSystemProperty) {
      throw RangeError(`EdmDouble type shouldn't be a system property.`);
    }

    if (
      force ||
      (typeof this.typedValue === "string" &&
        (annotationLevel === AnnotationLevel.MINIMAL ||
          annotationLevel === AnnotationLevel.FULL))
    ) {
      return [`${name}${ODATA_TYPE}`, "Edm.Double"];
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
