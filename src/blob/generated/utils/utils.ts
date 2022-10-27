import { createHmac } from "crypto";
import URITemplate from "uri-templates";
import { USERDELEGATIONKEY_BASIC_KEY } from "../../utils/constants";

export function isURITemplateMatch(url: string, template: string): boolean {
  const uriTemplate = URITemplate(template);
  // TODO: Fixing $ parsing issue such as $logs container cannot work in strict mode issue
  const result = (uriTemplate.fromUri as any)(url, { strict: true });
  if (result === undefined) {
    return false;
  }

  for (const key in result) {
    if (result.hasOwnProperty(key)) {
      const element = result[key];
      if (element === "") {
        return false;
      }
    }
  }
  return true;
}

export function getUserDelegationKeyValue(
  signedObjectid: string,
  signedTenantid: string,
  signedStartsOn: string,
  signedExpiresOn: string,
  signedVersion: string,
) : string {
  
  const stringToSign = [
    signedObjectid,
    signedTenantid,
    signedStartsOn,
    signedExpiresOn,
    "b",
    signedVersion
  ].join("\n");

  return createHmac("sha256", USERDELEGATIONKEY_BASIC_KEY).update(stringToSign, "utf8").digest("base64");
}