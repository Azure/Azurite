import * as msRest from "@azure/ms-rest-js";

import * as Mappers from "../artifacts/mappers";
import Context, { IHandlerParameters } from "../Context";
import IRequest from "../IRequest";
import IResponse from "../IResponse";
import ILogger from "./ILogger";
import { parseXML, stringifyXML } from "./xml";

export declare type ParameterPath =
  | string
  | string[]
  | {
      [propertyName: string]: ParameterPath;
    };

export async function deserialize(
  context: Context,
  req: IRequest,
  spec: msRest.OperationSpec,
  logger: ILogger
): Promise<IHandlerParameters> {
  const parameters: IHandlerParameters = {};

  // Deserialize query parameters
  for (const queryParameter of spec.queryParameters || []) {
    if (!queryParameter.mapper.serializedName) {
      throw new TypeError(
        `QueryParameter mapper doesn't include valid "serializedName"`
      );
    }
    const queryKey = queryParameter.mapper.serializedName;
    let queryValueOriginal: string | string[] | undefined = req.getQuery(
      queryKey
    );

    if (
      queryValueOriginal !== undefined &&
      queryParameter.collectionFormat !== undefined &&
      queryParameter.mapper.type.name === "Sequence"
    ) {
      queryValueOriginal = `${queryValueOriginal}`.split(
        queryParameter.collectionFormat
      );
    }

    const queryValue = spec.serializer.deserialize(
      queryParameter.mapper,
      queryValueOriginal,
      queryKey
    );

    // TODO: Currently validation is only in serialize method,
    // remove when adding validateConstraints to deserialize()
    // TODO: Make serialize return ServerError according to different validations?
    spec.serializer.serialize(queryParameter.mapper, queryValue);

    setParametersValue(parameters, queryParameter.parameterPath, queryValue);
  }

  // Deserialize header parameters
  for (const headerParameter of spec.headerParameters || []) {
    if (!headerParameter.mapper.serializedName) {
      throw new TypeError(
        `HeaderParameter mapper doesn't include valid "serializedName"`
      );
    }

    const headerCollectionPrefix:
      | string
      | undefined = (headerParameter.mapper as msRest.DictionaryMapper)
      .headerCollectionPrefix;
    if (headerCollectionPrefix) {
      const dictionary: any = {};
      const headers = req.getHeaders();
      for (const headerKey of Object.keys(headers)) {
        if (
          headerKey
            .toLowerCase()
            .startsWith(headerCollectionPrefix.toLocaleLowerCase())
        ) {
          // TODO: Validate collection type by serializer
          dictionary[
            headerKey.substring(headerCollectionPrefix.length)
          ] = spec.serializer.serialize(
            (headerParameter.mapper as msRest.DictionaryMapper).type.value,
            headers[headerKey],
            headerKey
          );
        }
      }
      setParametersValue(parameters, headerParameter.parameterPath, dictionary);
    } else {
      const headerKey = headerParameter.mapper.serializedName;
      const headerValueOriginal = req.getHeader(headerKey);
      const headerValue = spec.serializer.deserialize(
        headerParameter.mapper,
        headerValueOriginal,
        headerKey
      );

      // TODO: Currently validation is only in serialize method,
      // remove when adding validateConstraints to deserialize()
      spec.serializer.serialize(headerParameter.mapper, headerValue);

      setParametersValue(
        parameters,
        headerParameter.parameterPath,
        headerValue
      );
    }
  }

  // Deserialize body
  const bodyParameter = spec.requestBody;

  if (bodyParameter && bodyParameter.mapper.type.name === "Stream") {
    setParametersValue(parameters, "body", req.getBodyStream());
  } else if (bodyParameter) {
    const jsonContentTypes = ["application/json", "text/json"];
    const xmlContentTypes = ["application/xml", "application/atom+xml"];
    const contentType = req.getHeader("content-type") || "";
    const contentComponents = !contentType
      ? []
      : contentType.split(";").map(component => component.toLowerCase());

    const isRequestWithJSON = contentComponents.some(
      component => jsonContentTypes.indexOf(component) !== -1
    ); // TODO
    const isRequestWithXML =
      spec.isXML ||
      contentComponents.some(
        component => xmlContentTypes.indexOf(component) !== -1
      );
    // const isRequestWithStream = false;

    const body = await readRequestIntoText(req);
    logger.debug(
      `deserialize(): Raw request body string is ${body}`,
      context.contextId
    );

    req.setBody(body);
    let parsedBody: object = {};
    if (isRequestWithJSON) {
      // read body
      parsedBody = JSON.parse(body);
    } else if (isRequestWithXML) {
      parsedBody = (await parseXML(body)) || {};
    }

    let valueToDeserialize: any = parsedBody;
    if (
      spec.isXML &&
      bodyParameter.mapper.type.name === msRest.MapperType.Sequence
    ) {
      valueToDeserialize =
        typeof valueToDeserialize === "object"
          ? valueToDeserialize[bodyParameter.mapper.xmlElementName!]
          : [];
    }

    parsedBody = spec.serializer.deserialize(
      bodyParameter.mapper,
      valueToDeserialize,
      bodyParameter.mapper.serializedName!
    );

    // Validation purpose only, because only serialize supports validation
    // TODO: Inject convenience layer error into deserialize; Drop @azure/ms-rest-js, move logic into generated code
    spec.serializer.serialize(bodyParameter.mapper, parsedBody);

    setParametersValue(parameters, bodyParameter.parameterPath, parsedBody);
    setParametersValue(parameters, "body", req.getBody());
  }

  return parameters;
}

async function readRequestIntoText(req: IRequest): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const segments: string[] = [];
    const bodyStream = req.getBodyStream();
    bodyStream.on("data", buffer => {
      segments.push(buffer);
    });
    bodyStream.on("error", reject);
    bodyStream.on("end", () => {
      const joined = segments.join("");
      resolve(joined);
    });
  });
}

function setParametersValue(
  parameters: IHandlerParameters,
  parameterPath: ParameterPath,
  parameterValue: any
) {
  if (typeof parameterPath === "string") {
    parameters[parameterPath] = parameterValue;
  } else if (Array.isArray(parameterPath)) {
    let leafParent = parameters;
    for (let i = 0; i < parameterPath.length - 1; i++) {
      const currentPropertyName = parameterPath[i];
      if (!leafParent[currentPropertyName]) {
        leafParent[currentPropertyName] = {};
      }
      leafParent = leafParent[currentPropertyName];
    }

    const lastPropertyName = parameterPath[parameterPath.length - 1];
    leafParent[lastPropertyName] = parameterValue;
  } else {
    throw new TypeError(`parameterPath is not string or string[]`);
  }
}

export async function serialize(
  context: Context,
  res: IResponse,
  spec: msRest.OperationSpec,
  handlerResponse: any,
  logger: ILogger
): Promise<void> {
  const statusCodeInResponse: number = handlerResponse.statusCode;
  res.setStatusCode(statusCodeInResponse);

  const responseSpec = spec.responses[statusCodeInResponse];
  if (!responseSpec) {
    throw new TypeError(
      `Request specification doesn't include provided response status code`
    );
  }

  // Serialize headers
  const headerSerializer = new msRest.Serializer(Mappers);
  const headersMapper = responseSpec.headersMapper;
  if (headersMapper && headersMapper.type.name === "Composite") {
    const mappersForAllHeaders = headersMapper.type.modelProperties || {};

    // Handle headerMapper one by one
    for (const key in mappersForAllHeaders) {
      if (mappersForAllHeaders.hasOwnProperty(key)) {
        const headerMapper = mappersForAllHeaders[key];
        const headerName = headerMapper.serializedName;
        const headerValueOriginal = handlerResponse[key];
        const headerValueSerialized = headerSerializer.serialize(
          headerMapper,
          headerValueOriginal
        );

        // Handle collection of headers starting with same prefix, such as x-ms-meta prefix
        const headerCollectionPrefix = (headerMapper as msRest.DictionaryMapper)
          .headerCollectionPrefix;
        if (
          headerCollectionPrefix !== undefined &&
          headerValueOriginal !== undefined
        ) {
          for (const collectionHeaderPartialName in headerValueSerialized) {
            if (
              headerValueSerialized.hasOwnProperty(collectionHeaderPartialName)
            ) {
              const collectionHeaderValueSerialized =
                headerValueSerialized[collectionHeaderPartialName];
              const collectionHeaderName = `${headerCollectionPrefix}${collectionHeaderPartialName}`;
              if (
                collectionHeaderName &&
                collectionHeaderValueSerialized !== undefined
              ) {
                res.setHeader(
                  collectionHeaderName,
                  collectionHeaderValueSerialized
                );
              }
            }
          }
        } else {
          if (headerName && headerValueSerialized !== undefined) {
            res.setHeader(headerName, headerValueSerialized);
          }
        }
      }
    }
  }

  // Serialize XML bodies
  if (
    spec.isXML &&
    responseSpec.bodyMapper &&
    responseSpec.bodyMapper.type.name !== "Stream"
  ) {
    let body = spec.serializer.serialize(
      responseSpec.bodyMapper!,
      handlerResponse
    );

    // When root element is sequence type, should wrap with because serialize() doesn't do that
    if (responseSpec.bodyMapper!.type.name === "Sequence") {
      const sequenceElementName = responseSpec.bodyMapper!.xmlElementName;
      if (sequenceElementName !== undefined) {
        const newBody = {} as any;
        newBody[sequenceElementName] = body;
        body = newBody;
      }
    }

    const xmlBody = stringifyXML(body, {
      rootName:
        responseSpec.bodyMapper!.xmlName ||
        responseSpec.bodyMapper!.serializedName
    });
    res.setContentType(`application/xml`);

    // TODO: Should send response in a serializer?
    res.getBodyStream().write(xmlBody);
    logger.debug(
      `Serializer: Raw response body string is ${xmlBody}`,
      context.contextId
    );
    logger.info(`Serializer: Start returning stream body.`, context.contextId);
  }

  // Serialize stream body
  // TODO: Move to end middleware for end tracking
  if (
    handlerResponse.body &&
    responseSpec.bodyMapper &&
    responseSpec.bodyMapper.type.name === "Stream"
  ) {
    logger.info(`Serializer: Start returning stream body.`, context.contextId);

    await new Promise((resolve, reject) => {
      (handlerResponse.body as NodeJS.ReadableStream)
        .on("error", reject)
        .pipe(res.getBodyStream())
        .on("error", reject)
        .on("close", resolve);
    });

    // const totalTimeInMS = context.startTime
    //   ? new Date().getTime() - context.startTime.getTime()
    //   : undefined;

    // logger.info(
    // tslint:disable-next-line:max-line-length
    //   `Serializer: End response. TotalTimeInMS=${totalTimeInMS} StatusCode=${res.getStatusCode()} StatusMessage=${res.getStatusMessage()} Headers=${JSON.stringify(
    //     res.getHeaders()
    //   )}`,
    //   context.contextID
    // );
  }
}
