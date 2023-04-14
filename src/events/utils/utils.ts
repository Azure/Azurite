import Context from "../generated/Context";
import {
  HeaderConstants,
  MINIMAL_METADATA_ACCEPT,
  XML_METADATA
} from "./constants";

export function getPayloadFormat(context: Context): string {
  let format = context.request?.getHeader(HeaderConstants.ACCEPT);

  const formatParameter = context.request?.getQuery("$format");
  if (typeof formatParameter === "string") {
    format = formatParameter;
  }

  if (format === undefined || format === "") {
    format = XML_METADATA;
  }

  if (format === "application/json") {
    format = MINIMAL_METADATA_ACCEPT;
  }

  format = format.replace(/\s/g, "");

  return format;
}
