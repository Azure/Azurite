import type Context from "../../generated/Context";
import type { IHandlerParameters } from "../../generated/Context";
import type IRequest from "../../generated/IRequest";
import type IResponse from "../../generated/IResponse";
import { parseXML, stringifyXML } from "../../generated/utils/xml";

export type OperationTypeBinding =
  | { readonly kind: "string" | "number" | "boolean" | "datetime" | "unknown" }
  | { readonly kind: "model"; readonly name: string }
  | {
      readonly kind: "literal";
      readonly value: string | number | boolean;
    }
  | { readonly kind: "array"; readonly element: OperationTypeBinding }
  | { readonly kind: "record"; readonly element: OperationTypeBinding }
  | {
      readonly kind: "union";
      readonly variants: readonly OperationTypeBinding[];
    };

export interface OperationParameterBinding {
  readonly name: string;
  readonly wireName: string;
  readonly location: "path" | "query" | "header";
  readonly required: boolean;
  readonly type: OperationTypeBinding;
  readonly collectionPrefix?: string;
}

export interface OperationResponseHeaderBinding {
  readonly name: string;
  readonly wireName: string;
  readonly type: OperationTypeBinding;
  readonly collectionPrefix?: string;
}

export interface OperationResponseMetadata {
  readonly statusCode: number | "*";
  readonly headers: readonly OperationResponseHeaderBinding[];
  readonly body?: { readonly type: OperationTypeBinding };
}

export interface OperationLiteralQueryParameter {
  readonly name: string;
  readonly value: string;
}

export interface OperationMetadata {
  readonly name: string;
  readonly verb: string;
  readonly rawPath: string;
  readonly path: string;
  readonly literalQueryParameters: readonly OperationLiteralQueryParameter[];
  readonly requiredQueryParameters: readonly string[];
  readonly requiredHeaderParameters: readonly string[];
  readonly parameters: readonly OperationParameterBinding[];
  readonly hasRequestBody: boolean;
  readonly requestBodyContentTypes: readonly string[];
  readonly requestBodyParameterPath?: string | readonly string[];
  readonly requestBodyType?: OperationTypeBinding;
  readonly responses: readonly OperationResponseMetadata[];
  readonly interfaceName?: string;
}

export interface XmlPropertyMetadata {
  readonly name: string;
  readonly wireName: string;
  readonly type: OperationTypeBinding;
  readonly attribute: boolean;
  readonly unwrapped: boolean;
  readonly itemName?: string;
  readonly required: boolean;
}

export interface XmlModelMetadata {
  readonly name: string;
  readonly wireName: string;
  readonly properties: readonly XmlPropertyMetadata[];
}

export type OperationTypeDescriptor =
  | "string"
  | "number"
  | "boolean"
  | "datetime"
  | "unknown"
  | readonly ["model", string]
  | readonly ["literal", string | number | boolean]
  | readonly ["array", OperationTypeDescriptor]
  | readonly ["record", OperationTypeDescriptor]
  | readonly ["union", readonly OperationTypeDescriptor[]];

export type OperationParameterDescriptor = readonly [
  name: string,
  wireName: string,
  location: "path" | "query" | "header",
  type: OperationTypeDescriptor,
  required?: true,
  collectionPrefix?: string
];

export type OperationResponseHeaderDescriptor = readonly [
  name: string,
  wireName: string,
  type: OperationTypeDescriptor,
  collectionPrefix?: string
];

export type OperationResponseDescriptor = readonly [
  statusCode: number | "*",
  headers?: readonly OperationResponseHeaderDescriptor[],
  bodyType?: OperationTypeDescriptor
];

export type OperationRequestBodyDescriptor = readonly [
  type: OperationTypeDescriptor,
  contentTypes: readonly string[],
  parameterPath?: string | readonly string[]
];

export type OperationDescriptor = readonly [
  name: string,
  verb: string,
  rawPath: string,
  parameters: readonly OperationParameterDescriptor[],
  requestBody: OperationRequestBodyDescriptor | undefined,
  responses: readonly OperationResponseDescriptor[],
  interfaceName?: string
];

export type XmlPropertyDescriptor = readonly [
  name: string,
  wireName: string,
  type: OperationTypeDescriptor,
  mode?: "attribute" | "unwrapped",
  itemName?: string,
  required?: true
];

export type XmlModelDescriptor = readonly [
  wireName: string,
  properties: readonly XmlPropertyDescriptor[]
];

export type XmlModelDescriptorMap = Readonly<
  Record<string, XmlModelDescriptor>
>;

export type NamedXmlModelDescriptor = readonly [
  name: string,
  wireName: string,
  properties: readonly XmlPropertyDescriptor[]
];

export interface ServiceMetadataDescriptor {
  readonly operations: readonly OperationDescriptor[];
  readonly xmlModels:
    XmlModelDescriptorMap | readonly NamedXmlModelDescriptor[];
}

export function defineOperation<T extends OperationDescriptor>(
  descriptor: T
): T {
  return descriptor;
}

export function defineXmlModel(
  name: string,
  [wireName, properties]: XmlModelDescriptor
): NamedXmlModelDescriptor {
  return [name, wireName, properties];
}

function expandTypeDescriptor(
  descriptor: OperationTypeDescriptor
): OperationTypeBinding {
  if (typeof descriptor === "string") return { kind: descriptor };
  switch (descriptor[0]) {
    case "model":
      return { kind: "model", name: descriptor[1] };
    case "literal":
      return { kind: "literal", value: descriptor[1] };
    case "array":
      return { kind: "array", element: expandTypeDescriptor(descriptor[1]) };
    case "record":
      return { kind: "record", element: expandTypeDescriptor(descriptor[1]) };
    case "union":
      return {
        kind: "union",
        variants: descriptor[1].map(expandTypeDescriptor)
      };
  }
}

export function defineOperations(
  descriptors: readonly OperationDescriptor[]
): readonly OperationMetadata[] {
  return descriptors.map(
    ([
      name,
      verb,
      rawPath,
      parameterDescriptors,
      requestBody,
      responseDescriptors,
      interfaceName
    ]) => {
      const [path, query] = rawPath.split("?", 2);
      const parameters = parameterDescriptors.map(
        ([
          parameterName,
          wireName,
          location,
          type,
          required,
          collectionPrefix
        ]) => ({
          name: parameterName,
          wireName,
          location,
          required: required ?? false,
          type: expandTypeDescriptor(type),
          ...(collectionPrefix === undefined ? {} : { collectionPrefix })
        })
      );
      const literalQueryParameters = (query ?? "")
        .split("&")
        .filter(Boolean)
        .map((pair) => {
          const [parameterName, value = ""] = pair.split("=", 2);
          return {
            name: decodeURIComponent(parameterName),
            value: decodeURIComponent(value)
          };
        });
      return {
        name,
        verb,
        rawPath,
        path,
        literalQueryParameters,
        requiredQueryParameters: parameters
          .filter(
            (parameter) => parameter.location === "query" && parameter.required
          )
          .map((parameter) => parameter.wireName),
        requiredHeaderParameters: parameters
          .filter(
            (parameter) => parameter.location === "header" && parameter.required
          )
          .map((parameter) => parameter.wireName),
        parameters,
        hasRequestBody: requestBody !== undefined,
        requestBodyContentTypes: requestBody?.[1] ?? [],
        requestBodyParameterPath:
          requestBody === undefined ? undefined : (requestBody[2] ?? "body"),
        requestBodyType:
          requestBody === undefined
            ? undefined
            : expandTypeDescriptor(requestBody[0]),
        responses: responseDescriptors.map(
          ([statusCode, headers, bodyType]) => ({
            statusCode,
            headers: (headers ?? []).map(
              ([headerName, wireName, type, collectionPrefix]) => ({
                name: headerName,
                wireName,
                type: expandTypeDescriptor(type),
                ...(collectionPrefix === undefined ? {} : { collectionPrefix })
              })
            ),
            body:
              bodyType === undefined
                ? undefined
                : { type: expandTypeDescriptor(bodyType) }
          })
        ),
        interfaceName
      };
    }
  );
}

export function defineXmlModels(
  descriptors: XmlModelDescriptorMap | readonly NamedXmlModelDescriptor[]
): Readonly<Record<string, XmlModelMetadata>> {
  const entries: readonly (readonly [string, XmlModelDescriptor])[] =
    Array.isArray(descriptors)
      ? descriptors.map(([name, wireName, properties]) => [
          name,
          [wireName, properties]
        ])
      : Object.entries(descriptors);
  return Object.fromEntries(
    entries.map(([name, [wireName, properties]]) => [
      name,
      {
        name,
        wireName,
        properties: properties.map(
          ([
            propertyName,
            propertyWireName,
            type,
            mode,
            itemName,
            required
          ]) => ({
            name: propertyName,
            wireName: propertyWireName,
            type: expandTypeDescriptor(type),
            attribute: mode === "attribute",
            unwrapped: mode === "unwrapped",
            itemName,
            required: required ?? false
          })
        )
      }
    ])
  );
}

export interface ServiceMetadata {
  readonly operations: readonly OperationMetadata[];
  readonly xmlModels: Readonly<Record<string, XmlModelMetadata>>;
}

export function defineServiceMetadata({
  operations,
  xmlModels
}: ServiceMetadataDescriptor): ServiceMetadata {
  return {
    operations: defineOperations(operations),
    xmlModels: defineXmlModels(xmlModels)
  };
}

export interface SerializationRuntime {
  deserializeRequest(
    name: string,
    req: IRequest,
    context: Context
  ): Promise<IHandlerParameters | undefined>;
  serializeResponse(
    name: string,
    res: IResponse,
    handlerResponse: unknown
  ): boolean;
  hasGeneratedSerialization(name: string): boolean;
}

export function createSerializationRuntime({
  operations,
  xmlModels
}: ServiceMetadata): SerializationRuntime {
  const operationsByName = new Map(
    operations.map((operation) => [operation.name, operation])
  );

  const getXmlModel = (name: string): XmlModelMetadata => {
    const metadata = xmlModels[name];
    if (metadata === undefined) {
      throw new TypeError(
        `Generated TypeSpec XML metadata does not include model ${name}`
      );
    }
    return metadata;
  };

  const deserializeNumber = (value: string, wireName: string): number => {
    const number = Number(value);
    if (value.trim() === "" || !Number.isFinite(number)) {
      throw new TypeError(`Parameter ${wireName} must be a finite number`);
    }
    return number;
  };

  const deserializeXmlValue = (
    value: any,
    type: OperationTypeBinding,
    property?: XmlPropertyMetadata
  ): unknown => {
    if (value === undefined || value === null) return undefined;
    switch (type.kind) {
      case "model":
        return deserializeXmlModel(value, type.name);
      case "array": {
        const rawItems = property?.unwrapped
          ? value
          : value?.[property?.itemName ?? property?.wireName ?? "item"];
        const items = Array.isArray(rawItems)
          ? rawItems
          : rawItems === undefined
            ? []
            : [rawItems];
        return items.map((item) => deserializeXmlValue(item, type.element));
      }
      case "record":
        return typeof value === "object" ? value : undefined;
      case "number":
        return deserializeNumber(String(value), property?.wireName ?? "value");
      case "boolean":
        return value === true || value === "true";
      case "literal":
        return type.value;
      case "datetime":
      case "string":
      case "union":
      case "unknown":
        return String(value);
    }
  };

  const deserializeXmlModel = (
    value: any,
    modelName: string
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const property of getXmlModel(modelName).properties) {
      const source = property.attribute
        ? value?.$?.[property.wireName]
        : property.unwrapped
          ? value?.[property.itemName ?? property.wireName]
          : value?.[property.wireName];
      if (property.required && source === undefined) {
        if (property.type.kind === "boolean") {
          result[property.name] = false;
          continue;
        }
        if (property.type.kind === "number") {
          result[property.name] = 0;
          continue;
        }
        if (property.type.kind === "array") {
          result[property.name] = [];
          continue;
        }
        throw new TypeError(
          `Missing required XML property ${property.wireName} for ${modelName}`
        );
      }
      const deserialized = deserializeXmlValue(source, property.type, property);
      if (deserialized !== undefined) result[property.name] = deserialized;
    }
    return result;
  };

  const serializeXmlValue = (
    value: any,
    type: OperationTypeBinding,
    property?: XmlPropertyMetadata
  ): unknown => {
    if (value === undefined) return undefined;
    switch (type.kind) {
      case "model":
        return serializeXmlModel(value, type.name);
      case "array": {
        const items = Array.isArray(value) ? value : [value];
        const serialized = items.map((item) =>
          serializeXmlValue(item, type.element)
        );
        return property?.unwrapped
          ? serialized
          : {
              [property?.itemName ?? property?.wireName ?? "item"]: serialized
            };
      }
      case "datetime":
        return value instanceof Date ? value.toUTCString() : String(value);
      case "literal":
        return type.value;
      case "boolean":
      case "number":
      case "record":
      case "string":
      case "union":
      case "unknown":
        return value;
    }
  };

  const serializeXmlModel = (
    value: any,
    modelName: string
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    const attributes: Record<string, unknown> = {};
    for (const property of getXmlModel(modelName).properties) {
      const serialized = serializeXmlValue(
        value?.[property.name],
        property.type,
        property
      );
      if (serialized === undefined) continue;
      if (property.attribute) {
        attributes[property.wireName] = serialized;
      } else {
        result[
          property.unwrapped
            ? (property.itemName ?? property.wireName)
            : property.wireName
        ] = serialized;
      }
    }
    if (Object.keys(attributes).length > 0) result.$ = attributes;
    return result;
  };

  const readRequestIntoText = async (req: IRequest): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const segments: string[] = [];
      const bodyStream = req.getBodyStream();
      bodyStream.on("data", (buffer) => segments.push(buffer));
      bodyStream.on("error", reject);
      bodyStream.on("end", () => resolve(segments.join("")));
    });

  const deserializeRequestBody = async (
    metadata: OperationMetadata,
    req: IRequest
  ): Promise<unknown> => {
    const rawBody = await readRequestIntoText(req);
    req.setBody(rawBody);
    if (metadata.requestBodyType?.kind !== "model") return rawBody;
    const contentType =
      req.getHeader("content-type") ??
      metadata.requestBodyContentTypes[0] ??
      "";
    if (contentType.toLowerCase().includes("json")) return JSON.parse(rawBody);
    return deserializeXmlModel(
      (await parseXML(rawBody, false, "")) || {},
      metadata.requestBodyType.name
    );
  };

  const normalizeValue = (
    value: string | string[] | undefined
  ): string | undefined => (Array.isArray(value) ? value.join(",") : value);

  const deserializeString = (
    value: string | string[] | undefined,
    wireName: string,
    required: boolean
  ): string | undefined => {
    const normalized = normalizeValue(value);
    if (required && normalized === undefined) {
      throw new TypeError(`Required parameter ${wireName} was not provided`);
    }
    return normalized;
  };

  const deserializeArrayItem = (
    type: OperationTypeBinding,
    value: string
  ): unknown => {
    switch (type.kind) {
      case "number":
        return deserializeNumber(value, "array item");
      case "boolean":
        return value === "true" ? true : value === "false" ? false : value;
      case "literal":
        return type.value;
      case "array":
        return value
          .split(",")
          .map((item) => deserializeArrayItem(type.element, item));
      case "datetime":
      case "model":
      case "record":
      case "string":
      case "union":
      case "unknown":
        return value;
    }
  };

  const deserializeValue = (
    type: OperationTypeBinding,
    value: string | string[] | undefined,
    wireName: string,
    required: boolean
  ): unknown => {
    const normalized = deserializeString(value, wireName, required);
    if (normalized === undefined) return undefined;
    switch (type.kind) {
      case "number":
        return deserializeNumber(normalized, wireName);
      case "boolean":
        return normalized === "true"
          ? true
          : normalized === "false"
            ? false
            : normalized;
      case "literal":
        const actual =
          wireName.toLowerCase() === "content-type"
            ? normalized.split(";", 1)[0].trim().toLowerCase()
            : normalized;
        const expected =
          wireName.toLowerCase() === "content-type"
            ? String(type.value).toLowerCase()
            : String(type.value);
        if (expected !== actual) {
          throw new TypeError(
            `Parameter ${wireName} expected ${type.value} but received ${normalized}`
          );
        }
        return type.value;
      case "array":
        return normalized
          .split(",")
          .map((item) => deserializeArrayItem(type.element, item));
      case "datetime":
      case "model":
      case "record":
      case "string":
      case "union":
      case "unknown":
        return normalized;
    }
  };

  const getHeaderCollection = (
    headers: Record<string, string | string[] | undefined>,
    prefix: string
  ): Record<string, string | string[]> => {
    const values: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (
        name.toLowerCase().startsWith(prefix.toLowerCase()) &&
        value !== undefined
      ) {
        values[name.substring(prefix.length)] = value;
      }
    }
    return values;
  };

  const getContextValue = (
    context: Context,
    binding: OperationParameterBinding
  ): string | string[] | undefined => {
    const source = context as unknown as Record<string, unknown>;
    const nested = source.context as Record<string, unknown> | undefined;
    const value =
      source[binding.name] ??
      source[binding.wireName] ??
      nested?.[binding.name] ??
      nested?.[binding.wireName];
    if (value === undefined || value === null) return undefined;
    return typeof value === "string" || Array.isArray(value)
      ? (value as string | string[])
      : String(value);
  };

  const deserializeParameter = (
    parameter: OperationParameterBinding,
    req: IRequest,
    context: Context
  ): unknown => {
    let value: string | string[] | undefined;
    if (parameter.location === "path") {
      value = getContextValue(context, parameter);
    } else if (parameter.location === "query") {
      value = req.getQuery(parameter.wireName);
    } else if (parameter.collectionPrefix !== undefined) {
      return getHeaderCollection(req.getHeaders(), parameter.collectionPrefix);
    } else {
      value = req.getHeader(parameter.wireName);
    }
    return deserializeValue(
      parameter.type,
      value,
      parameter.wireName,
      parameter.required
    );
  };

  const setParameterValue = (
    parameters: IHandlerParameters,
    path: string | readonly string[],
    value: unknown
  ): void => {
    if (value === undefined) return;
    if (typeof path === "string") {
      parameters[path] = value;
      return;
    }
    let parent = parameters;
    for (const name of path.slice(0, -1)) {
      if (!parent[name]) parent[name] = {};
      parent = parent[name];
    }
    parent[path[path.length - 1]] = value;
  };

  const serializeValue = (
    type: OperationTypeBinding,
    value: unknown
  ): string | number | boolean | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === "bigint") return value.toString();
    switch (type.kind) {
      case "datetime":
        return value instanceof Date ? value.toUTCString() : String(value);
      case "array":
        return Array.isArray(value)
          ? value.map((item) => serializeValue(type.element, item)).join(",")
          : String(value);
      case "literal":
        return type.value;
      case "boolean":
      case "number":
      case "model":
      case "record":
      case "string":
      case "union":
      case "unknown":
        return value as string | number | boolean;
    }
  };

  const setHeaderCollection = (
    res: IResponse,
    prefix: string,
    value: Record<string, unknown> | undefined
  ): void => {
    if (value === undefined) return;
    for (const [suffix, itemValue] of Object.entries(value)) {
      if (itemValue !== undefined) {
        res.setHeader(prefix + suffix, String(itemValue));
      }
    }
  };

  return {
    async deserializeRequest(name, req, context) {
      const metadata = operationsByName.get(name);
      if (metadata === undefined) return undefined;
      const parameters: IHandlerParameters = {};
      for (const parameter of metadata.parameters) {
        setParameterValue(
          parameters,
          parameter.name,
          deserializeParameter(parameter, req, context)
        );
      }
      if (
        metadata.requestBodyType !== undefined &&
        metadata.requestBodyParameterPath !== undefined
      ) {
        setParameterValue(
          parameters,
          metadata.requestBodyParameterPath,
          await deserializeRequestBody(metadata, req)
        );
      }
      return parameters;
    },

    serializeResponse(name, res, handlerResponse) {
      const metadata = operationsByName.get(name);
      if (metadata === undefined) return false;
      const value = handlerResponse as {
        statusCode: number;
        headers?: Record<string, unknown>;
        body?: unknown;
      };
      res.setStatusCode(value.statusCode);
      const response =
        metadata.responses.find(
          (candidate) => candidate.statusCode === value.statusCode
        ) ??
        metadata.responses.find((candidate) => candidate.statusCode === "*");
      if (response === undefined) {
        throw new TypeError(
          `Generated TypeSpec serializer for ${metadata.name} does not include response status code ${value.statusCode}`
        );
      }
      for (const header of response.headers) {
        const headerValue = value.headers?.[header.name];
        if (header.collectionPrefix !== undefined) {
          setHeaderCollection(
            res,
            header.collectionPrefix,
            headerValue as Record<string, unknown> | undefined
          );
        } else {
          const serialized = serializeValue(header.type, headerValue);
          if (serialized !== undefined) {
            res.setHeader(header.wireName, serialized);
          }
        }
      }
      if (response.body?.type.kind === "model") {
        const model = getXmlModel(response.body.type.name);
        const body = stringifyXML(serializeXmlModel(value.body, model.name), {
          rootName: model.wireName
        });
        res.setContentType("application/xml");
        res.getBodyStream().write(body);
      }
      return true;
    },

    hasGeneratedSerialization(name) {
      return operationsByName.has(name);
    }
  };
}
