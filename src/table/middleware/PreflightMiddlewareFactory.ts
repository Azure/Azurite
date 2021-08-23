import * as msRest from "@azure/ms-rest-js";
import {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response
} from "express";

import ILogger from "../../common/ILogger";
import TableStorageContext from "../context/TableStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Mappers from "../generated/artifacts/mappers";
import Specifications from "../generated/artifacts/specifications";
import MiddlewareError from "../generated/errors/MiddlewareError";
import ITableMetadataStore from "../persistence/ITableMetadataStore";
import {
  DEFAULT_TABLE_CONTEXT_PATH,
  HeaderConstants,
  MethodConstants
} from "../utils/constants";

export default class PreflightMiddlewareFactory {
  constructor(private readonly logger: ILogger) {}

  public createOptionsHandlerMiddleware(
    metadataStore: ITableMetadataStore
  ): ErrorRequestHandler {
    return (
      err: MiddlewareError | Error,
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      if (req.method.toUpperCase() === MethodConstants.OPTIONS) {
        const context = new TableStorageContext(
          res.locals,
          DEFAULT_TABLE_CONTEXT_PATH
        );

        const requestId = context.contextID;
        const account = context.account!;

        this.logger.info(
          `PreflightMiddlewareFactory.createOptionsHandlerMiddleware(): OPTIONS request.`,
          requestId
        );

        const origin = req.header(HeaderConstants.ORIGIN);
        if (origin === undefined || typeof origin !== "string") {
          return next(
            StorageErrorFactory.getInvalidCorsHeaderValue(context, {
              MessageDetails: `Invalid required CORS header Origin ${JSON.stringify(
                origin
              )}`
            })
          );
        }

        const requestMethod = req.header(
          HeaderConstants.ACCESS_CONTROL_REQUEST_METHOD
        );
        if (requestMethod === undefined || typeof requestMethod !== "string") {
          return next(
            StorageErrorFactory.getInvalidCorsHeaderValue(context, {
              MessageDetails: `Invalid required CORS header Access-Control-Request-Method ${JSON.stringify(
                requestMethod
              )}`
            })
          );
        }

        const requestHeaders = req.headers[
          HeaderConstants.ACCESS_CONTROL_REQUEST_HEADERS
        ] as string;

        metadataStore
          .getServiceProperties(context, account)
          .then(properties => {
            if (properties === undefined || properties.cors === undefined) {
              return next(
                StorageErrorFactory.corsPreflightFailure(context, {
                  MessageDetails: "No CORS rules matches this request"
                })
              );
            }

            const corsSet = properties.cors;
            for (const cors of corsSet) {
              if (
                !this.checkOrigin(origin, cors.allowedOrigins) ||
                !this.checkMethod(requestMethod, cors.allowedMethods)
              ) {
                continue;
              }
              if (
                requestHeaders !== undefined &&
                !this.checkHeaders(requestHeaders, cors.allowedHeaders || "")
              ) {
                continue;
              }

              res.setHeader(
                HeaderConstants.ACCESS_CONTROL_ALLOW_ORIGIN,
                origin
              );
              res.setHeader(
                HeaderConstants.ACCESS_CONTROL_ALLOW_METHODS,
                requestMethod
              );
              if (requestHeaders !== undefined) {
                res.setHeader(
                  HeaderConstants.ACCESS_CONTROL_ALLOW_HEADERS,
                  requestHeaders
                );
              }
              res.setHeader(
                HeaderConstants.ACCESS_CONTROL_MAX_AGE,
                cors.maxAgeInSeconds
              );
              res.setHeader(
                HeaderConstants.ACCESS_CONTROL_ALLOW_CREDENTIALS,
                "true"
              );

              return next();
            }
            return next(
              StorageErrorFactory.corsPreflightFailure(context, {
                MessageDetails: "No CORS rules matches this request"
              })
            );
          })
          .catch(next);
      } else {
        next(err);
      }
    };
  }

  public createCorsRequestMiddleware(
    metadataStore: ITableMetadataStore,
    blockErrorRequest: boolean = false
  ): ErrorRequestHandler | RequestHandler {
    const internalMethod = (
      err: MiddlewareError | Error | undefined,
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      if (req.method.toUpperCase() === MethodConstants.OPTIONS) {
        return next(err);
      }

      const context = new TableStorageContext(
        res.locals,
        DEFAULT_TABLE_CONTEXT_PATH
      );

      const account = context.account!;

      const origin = req.headers[HeaderConstants.ORIGIN] as string | undefined;
      if (origin === undefined) {
        return next(err);
      }

      const method = req.method;
      if (method === undefined || typeof method !== "string") {
        return next(err);
      }

      metadataStore
        .getServiceProperties(context, account)
        .then(properties => {
          if (properties === undefined || properties.cors === undefined) {
            return next(err);
          }
          const corsSet = properties.cors;
          const resHeaders = this.getResponseHeaders(
            res,
            err instanceof MiddlewareError ? err : undefined
          );

          // Here we will match CORS settings in order and select first matched CORS
          for (const cors of corsSet) {
            if (
              this.checkOrigin(origin, cors.allowedOrigins) &&
              this.checkMethod(method, cors.allowedMethods)
            ) {
              const exposedHeaders = this.getExposedHeaders(
                resHeaders,
                cors.exposedHeaders || ""
              );

              res.setHeader(
                HeaderConstants.ACCESS_CONTROL_EXPOSE_HEADERS,
                exposedHeaders
              );

              res.setHeader(
                HeaderConstants.ACCESS_CONTROL_ALLOW_ORIGIN,
                cors.allowedOrigins === "*" ? "*" : origin! // origin is not undefined as checked in checkOrigin()
              );

              if (cors.allowedOrigins !== "*") {
                res.setHeader(HeaderConstants.VARY, "Origin");
                res.setHeader(
                  HeaderConstants.ACCESS_CONTROL_ALLOW_CREDENTIALS,
                  "true"
                );
              }

              return next(err);
            }
          }
          if (corsSet.length > 0) {
            res.setHeader(HeaderConstants.VARY, "Origin");
          }
          return next(err);
        })
        .catch(next);
    };

    if (blockErrorRequest) {
      return internalMethod;
    } else {
      return (req: Request, res: Response, next: NextFunction) => {
        internalMethod(undefined, req, res, next);
      };
    }
  }

  private checkOrigin(
    origin: string | undefined,
    allowedOrigin: string
  ): boolean {
    if (allowedOrigin === "*") {
      return true;
    }

    if (origin === undefined) {
      return false;
    }

    const allowedOriginArray = allowedOrigin.split(",");
    for (const corsOrigin of allowedOriginArray) {
      if (origin.trim().toLowerCase() === corsOrigin.trim().toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  private checkMethod(method: string, allowedMethod: string): boolean {
    const allowedMethodArray = allowedMethod.split(",");
    for (const corsMethod of allowedMethodArray) {
      if (method.trim().toLowerCase() === corsMethod.trim().toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  private checkHeaders(headers: string, allowedHeaders: string): boolean {
    const headersArray = headers.split(",");
    const allowedHeadersArray = allowedHeaders.split(",");
    for (const header of headersArray) {
      let flag = false;
      const trimmedHeader = header.trim().toLowerCase();

      for (const allowedHeader of allowedHeadersArray) {
        // TODO: Should remove the wrapping blank when set CORS through set properties for service.
        const trimmedAllowedHeader = allowedHeader.trim().toLowerCase();
        if (
          trimmedHeader === trimmedAllowedHeader ||
          (trimmedAllowedHeader[trimmedAllowedHeader.length - 1] === "*" &&
            trimmedHeader.startsWith(
              trimmedAllowedHeader.substr(0, trimmedAllowedHeader.length - 1)
            ))
        ) {
          flag = true;
          break;
        }
      }

      if (flag === false) {
        return false;
      }
    }

    return true;
  }

  private getResponseHeaders(res: Response, err?: MiddlewareError): string[] {
    const responseHeaderSet = [];

    const handlerResponse = res.locals.azurite_table_context.handlerResponses;

    if (handlerResponse) {
      const statusCodeInResponse: number = handlerResponse.statusCode;
      const spec = Specifications[res.locals.azurite_table_context.operation];
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
                  headerValueSerialized.hasOwnProperty(
                    collectionHeaderPartialName
                  )
                ) {
                  const collectionHeaderValueSerialized =
                    headerValueSerialized[collectionHeaderPartialName];
                  const collectionHeaderName = `${headerCollectionPrefix}${collectionHeaderPartialName}`;
                  if (
                    collectionHeaderName &&
                    collectionHeaderValueSerialized !== undefined
                  ) {
                    responseHeaderSet.push(collectionHeaderName);
                  }
                }
              }
            } else {
              if (headerName && headerValueSerialized !== undefined) {
                responseHeaderSet.push(headerName);
              }
            }
          }
        }
      }

      if (
        spec.isXML &&
        responseSpec.bodyMapper &&
        responseSpec.bodyMapper.type.name !== "Stream"
      ) {
        responseHeaderSet.push("content-type");
        responseHeaderSet.push("content-length");
      } else if (
        handlerResponse.body &&
        responseSpec.bodyMapper &&
        responseSpec.bodyMapper.type.name === "Stream"
      ) {
        responseHeaderSet.push("content-length");
      }
    }

    const headers = res.getHeaders();
    for (const header in headers) {
      if (typeof header === "string") {
        responseHeaderSet.push(header);
      }
    }

    if (err) {
      for (const key in err.headers) {
        if (err.headers.hasOwnProperty(key)) {
          responseHeaderSet.push(key);
        }
      }
    }

    // TODO: Should extract the header by some policy.
    // or apply a referred list indicates the related headers.
    responseHeaderSet.push("Date");
    responseHeaderSet.push("Connection");
    responseHeaderSet.push("Transfer-Encoding");

    return responseHeaderSet;
  }

  private getExposedHeaders(
    responseHeaders: any,
    exposedHeaders: string
  ): string {
    const exposedHeaderRules = exposedHeaders.split(",");
    const prefixRules = [];
    const simpleHeaders = [];
    for (let i = 0; i < exposedHeaderRules.length; i++) {
      exposedHeaderRules[i] = exposedHeaderRules[i].trim();
      if (exposedHeaderRules[i].endsWith("*")) {
        prefixRules.push(
          exposedHeaderRules[i]
            .substr(0, exposedHeaderRules[i].length - 1)
            .toLowerCase()
        );
      } else {
        simpleHeaders.push(exposedHeaderRules[i]);
      }
    }

    const resExposedHeaders: string[] = [];
    for (const header of responseHeaders) {
      let isMatch = false;
      for (const rule of prefixRules) {
        if (header.toLowerCase().startsWith(rule)) {
          isMatch = true;
          break;
        }
      }
      if (!isMatch) {
        for (const simpleHeader of simpleHeaders) {
          if (header.toLowerCase() === simpleHeader.toLowerCase()) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        resExposedHeaders.push(header);
      }
    }

    for (const simpleHeader of simpleHeaders) {
      let isMatch = false;
      for (const header of resExposedHeaders) {
        if (simpleHeader.toLowerCase() === header.toLowerCase()) {
          isMatch = true;
          break;
        }
      }
      if (!isMatch) {
        resExposedHeaders.push(simpleHeader);
      }
    }

    return resExposedHeaders.join(",");
  }
}