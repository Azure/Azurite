import * as xml2js from "xml2js";

export function stringifyXML(obj: any, opts?: { rootName?: string }) {
  const builder = new xml2js.Builder({
    explicitArray: false,
    explicitCharkey: false,
    renderOpts: {
      pretty: false
    },
    rootName: (opts || {}).rootName
  });
  return builder.buildObject(obj);
}

export function parseXML(
  str: string,
  explicitChildrenWithOrder: boolean = false
): Promise<any> {
  const xmlParser = new xml2js.Parser({
    explicitArray: false,
    explicitCharkey: false,
    explicitRoot: false,
    preserveChildrenOrder: explicitChildrenWithOrder,
    explicitChildren: explicitChildrenWithOrder,
    emptyTag: undefined
  });
  return new Promise((resolve, reject) => {
    xmlParser.parseString(str, (err?: Error, res?: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

export function jsonToXML(json: any): string {
  const build = new xml2js.Builder();
  return build.buildObject(json);
}
