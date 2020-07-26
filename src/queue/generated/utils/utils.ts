import URITemplate from "uri-templates";

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
