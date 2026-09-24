import * as assert from "assert";

export const xFormatGuid =
  "{0xca761232,0xed42,0x11ce,{0xba,0xcd,0x00,0xaa,0x00,0x57,0xb2,0x23}}";
export const xFormatGuidExtraClosingBrace = `${xFormatGuid}}`;

export function assertInvalidProposedLeaseId(
  error: any,
  headerValue: string
): void {
  assert.deepStrictEqual(error.statusCode, 400);
  assert.deepStrictEqual(error.code, "InvalidHeaderValue");
  assert.deepStrictEqual(error.details.errorCode, "InvalidHeaderValue");
  assert.deepStrictEqual(
    /<HeaderName>([^<]*)</.exec(error.response?.bodyAsText ?? "")?.[1],
    "x-ms-proposed-lease-id"
  );
  assert.deepStrictEqual(
    /<HeaderValue>([^<]*)</.exec(error.response?.bodyAsText ?? "")?.[1],
    headerValue
  );
}
