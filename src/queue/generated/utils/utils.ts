import URITemplate from "uri-templates";

// Use one parser for route matching and capture so handlers get the same decoded path values.
export function getURITemplateParameters(
  url: string,
  template: string
): Record<string, string> | undefined {
  const uriTemplate = URITemplate(template);
  // TODO: Fixing $ parsing issue such as $logs container cannot work in strict mode issue
  const result = (uriTemplate.fromUri as any)(url, { strict: true }) as
    | Record<string, string>
    | undefined;
  if (result === undefined) {
    return undefined;
  }

  for (const key in result) {
    if (result.hasOwnProperty(key)) {
      const element = result[key];
      if (element === "") {
        return undefined;
      }
    }
  }
  return result;
}

export function isURITemplateMatch(url: string, template: string): boolean {
  return getURITemplateParameters(url, template) !== undefined;
}
