import { URLBuilder } from "@azure/ms-rest-js";
import IAccountDataStore from "../../common/IAccountDataStore";
import { OAuthLevel } from "../../common/models";
import IExtentStore from "../../common/persistence/IExtentStore";
import AccountSASAuthenticator from "../authentication/AccountSASAuthenticator";
import BlobSASAuthenticator from "../authentication/BlobSASAuthenticator";
import BlobSharedKeyAuthenticator from "../authentication/BlobSharedKeyAuthenticator";
import BlobTokenAuthenticator from "../authentication/BlobTokenAuthenticator";
import IAuthenticator from "../authentication/IAuthenticator";
import PublicAccessAuthenticator from "../authentication/PublicAccessAuthenticator";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageError from "../errors/StorageError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import MiddlewareError from "../generated/errors/MiddlewareError";
import IHandlers from "../generated/handlers/IHandlers";
import IRequest, { HttpMethod } from "../generated/IRequest";
import IResponse from "../generated/IResponse";
import deserializerMiddleware from "../generated/middleware/deserializer.middleware";
import dispatchMiddleware from "../generated/middleware/dispatch.middleware";
import endMiddleware from "../generated/middleware/end.middleware";
import errorMiddleware from "../generated/middleware/error.middleware";
import HandlerMiddlewareFactory from "../generated/middleware/HandlerMiddlewareFactory";
import serializerMiddleware from "../generated/middleware/serializer.middleware";
import ILogger from "../generated/utils/ILogger";
import AuthenticationMiddlewareFactory from "../middlewares/AuthenticationMiddlewareFactory";
import { internalBlobStorageContextMiddleware } from "../middlewares/blobStorageContext.middleware";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { DEFAULT_CONTEXT_PATH, HTTP_HEADER_DELIMITER, HTTP_LINE_ENDING } from "../utils/constants";
import AppendBlobHandler from "./AppendBlobHandler";
import { BlobBatchSubRequest } from "./BlobBatchSubRequest";
import { BlobBatchSubResponse } from "./BlobBatchSubResponse";
import BlobHandler from "./BlobHandler";
import BlockBlobHandler from "./BlockBlobHandler";
import ContainerHandler from "./ContainerHandler";
import PageBlobHandler from "./PageBlobHandler";
import PageBlobRangesManager from "./PageBlobRangesManager";
import ServiceHandler from "./ServiceHandler";

type SubRequestNextFunction = (err?: any) => void;
type SubRequestHandler = (req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => any;
type SubRequestErrorHandler = (err: any, req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => any;

export class BlobBatchHandler {
  private handlers: IHandlers;
  private authenticators: IAuthenticator[];

  private handlePipeline: SubRequestHandler[];
  private errorHandler: SubRequestErrorHandler;
  private operationFinder: SubRequestHandler[];

  constructor(
    private readonly accountDataStore: IAccountDataStore,
    private readonly oauth: OAuthLevel | undefined,
    private readonly metadataStore: IBlobMetadataStore,
    private readonly extentStore: IExtentStore,
    private readonly logger: ILogger,
    private readonly loose: boolean,
    private readonly disableProductStyle?: boolean
  ) {
    const subRequestContextMiddleware = (req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => {
      const urlbuilder = URLBuilder.parse(req.getUrl());
      internalBlobStorageContextMiddleware(
        new BlobStorageContext(locals, DEFAULT_CONTEXT_PATH),
        req,
        res,
        urlbuilder.getHost()!,
        urlbuilder.getPath()!,
        next,
        true,
        this.disableProductStyle,
        this.loose
      );
    };

    const subRequestDispatchMiddleware = (req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => {
      dispatchMiddleware(
        new Context(locals, DEFAULT_CONTEXT_PATH, req, res),
        req,
        next,
        this.logger
      );
    };

    // AuthN middleware, like shared key auth or SAS auth
    const authenticationMiddlewareFactory = new AuthenticationMiddlewareFactory(
      this.logger
    );

    this.authenticators = [
      new PublicAccessAuthenticator(this.metadataStore, logger),
      new BlobSharedKeyAuthenticator(this.accountDataStore, logger),
      new AccountSASAuthenticator(
        this.accountDataStore,
        this.metadataStore,
        logger
      ),
      new BlobSASAuthenticator(
        this.accountDataStore,
        this.metadataStore,
        logger
      )
    ];

    if (this.oauth !== undefined) {
      this.authenticators.push(
        new BlobTokenAuthenticator(this.accountDataStore, this.oauth, logger)
      );
    }

    const subRequestAuthenticationMiddleware = (req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => {
      const context = new BlobStorageContext(locals, DEFAULT_CONTEXT_PATH);
      authenticationMiddlewareFactory.authenticate(
        context,
        req,
        res,
        this.authenticators
      ).then(pass => {
        // TODO: To support public access, we need to modify here to reject request later in handler
        if (pass) {
          next();
        } else {
          next(
            StorageErrorFactory.getAuthorizationFailure(context.contextId!)
          );
        }
      })
        .catch(errorInfo =>
          next(errorInfo));
    };

    const subRequestDeserializeMiddleware = (req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => {
      deserializerMiddleware(
        new Context(locals, DEFAULT_CONTEXT_PATH, req, res),
        req,
        next,
        this.logger
      );
    };

    this.handlers = {
      appendBlobHandler: new AppendBlobHandler(
        this.metadataStore,
        this.extentStore,
        this.logger,
        this.loose
      ),
      blobHandler: new BlobHandler(
        this.metadataStore,
        this.extentStore,
        this.logger,
        this.loose,
        new PageBlobRangesManager()
      ),
      blockBlobHandler: new BlockBlobHandler(
        this.metadataStore,
        this.extentStore,
        this.logger,
        this.loose
      ),
      containerHandler: new ContainerHandler(
        this.accountDataStore,
        this.oauth,
        this.metadataStore,
        this.extentStore,
        this.logger,
        this.loose
      ),
      pageBlobHandler: new PageBlobHandler(
        this.metadataStore,
        this.extentStore,
        this.logger,
        this.loose,
        new PageBlobRangesManager()
      ),
      serviceHandler: new ServiceHandler(
        this.accountDataStore,
        this.oauth,
        this.metadataStore,
        this.extentStore,
        this.logger,
        this.loose
      )
    };

    const handlerMiddlewareFactory = new HandlerMiddlewareFactory(
      this.handlers,
      this.logger
    );

    const subRequestHandlerMiddleware = (req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => {
      handlerMiddlewareFactory.createHandlerMiddleware()(
        new Context(locals, DEFAULT_CONTEXT_PATH, req, res),
        next
      );
    };

    const subRequestSerializeMiddleWare = (req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => {
      serializerMiddleware(
        new Context(locals, DEFAULT_CONTEXT_PATH, req, res),
        res,
        next,
        this.logger
      );
    };

    const subRequestErrorMiddleWare = (err: any, req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => {
      errorMiddleware(
        new Context(locals, DEFAULT_CONTEXT_PATH, req, res),
        err,
        req,
        res,
        next,
        this.logger
      );
    };

    const subRequestEndMiddleWare = (req: IRequest, res: IResponse, locals: any, next: SubRequestNextFunction) => {
      endMiddleware(
        new Context(locals, DEFAULT_CONTEXT_PATH, req, res),
        res,
        this.logger
      );
      next();
    };

    this.handlePipeline = [
      subRequestContextMiddleware,
      subRequestDispatchMiddleware,
      subRequestAuthenticationMiddleware,
      subRequestDeserializeMiddleware,
      subRequestHandlerMiddleware,
      subRequestSerializeMiddleWare,
      subRequestEndMiddleWare
    ];

    this.operationFinder = [
      subRequestContextMiddleware,
      subRequestDispatchMiddleware,
    ];

    this.errorHandler = subRequestErrorMiddleWare;
  }

  private async streamToBuffer2(
    stream: NodeJS.ReadableStream,
    buffer: Buffer,
    encoding?: BufferEncoding
  ): Promise<number> {
    let pos = 0; // Position in stream
    const bufferSize = buffer.length;

    return new Promise<number>((resolve, reject) => {
      stream.on("readable", () => {
        let chunk = stream.read();
        if (!chunk) {
          return;
        }
        if (typeof chunk === "string") {
          chunk = Buffer.from(chunk, encoding);
        }

        if (pos + chunk.length > bufferSize) {
          reject(new Error(`Stream exceeds buffer size. Buffer size: ${bufferSize}`));
          return;
        }

        buffer.fill(chunk, pos, pos + chunk.length);
        pos += chunk.length;
      });

      stream.on("end", () => {
        resolve(pos);
      });

      stream.on("error", reject);
    });
  }

  private async requestBodyToString(body: NodeJS.ReadableStream): Promise<string> {
    let buffer = Buffer.alloc(4 * 1024 * 1024);

    const responseLength = await this.streamToBuffer2(
      body,
      buffer
    );

    // Slice the buffer to trim the empty ending.
    buffer = buffer.slice(0, responseLength);

    return buffer.toString();
  }

  private async getSubRequestOperation(request: IRequest): Promise<Operation> {
    const subRequestHandlePipeline = this.operationFinder;
    const fakeResponse = new BlobBatchSubResponse(0, "HTTP/1.1");
    return new Promise((resolve, reject) => {
      const locals: any = {};
      let i = 0;
      const next = (error: any) => {
        if (error) {
          reject(error);
        }
        else {
          ++i;
          if (i < subRequestHandlePipeline.length) {
            subRequestHandlePipeline[i](request, fakeResponse, locals, next);
          }
          else {
            resolve((new Context(locals, DEFAULT_CONTEXT_PATH, request, fakeResponse)).operation!);
          }
        }
      };

      subRequestHandlePipeline[i](
        request,
        fakeResponse,
        locals,
        next
      );
    });
  }

  private async parseSubRequests(
    commonRequestId: string,
    perRequestPrefix: string,
    batchRequestEnding: string,
    subRequestPathPrefix: string,
    request: IRequest,
    body: string): Promise<BlobBatchSubRequest[]> {
    const requestAll = body.split(batchRequestEnding);
    const response1 = requestAll[0]; // string after ending is useless
    const response2 = response1.split(perRequestPrefix);
    const subRequests = response2.slice(1);

    const blobBatchSubRequests: BlobBatchSubRequest[] = [];

    let previousOperation: Operation | undefined;

    for (const subRequest of subRequests) {
      const requestLines = subRequest.split(`${HTTP_LINE_ENDING}`);

      // Content-Encoding
      // Content-Type
      // Content-ID
      // empty line
      // Operation infos
      if (requestLines.length < 5) throw new Error("Bad request");

      // Get Content_ID
      let lineIndex = 0;
      let content_id: number | undefined;

      while (lineIndex < requestLines.length) {
        if (requestLines[lineIndex] === '') break;
        const header = requestLines[lineIndex].split(HTTP_HEADER_DELIMITER, 2);

        if (header.length !== 2) throw new Error("Bad Request");

        if (header[0].toLocaleLowerCase() === "content-id") {
          content_id = parseInt(header[1], 10);
        }
        ++lineIndex;
      }

      if (content_id === undefined) throw new Error("Bad request");

      // "DELETE /container166063791875402779/blob0 HTTP/1.1"
      ++lineIndex;
      const operationInfos = requestLines[lineIndex].split(" ");
      if (operationInfos.length < 3) throw new Error("Bad request");

      const requestPath = operationInfos[1].startsWith("/") ? operationInfos[1] : "/" + operationInfos[1];

      if (!requestPath.startsWith(subRequestPathPrefix)) {
        throw new Error("Request from a different container");
      }

      const url = `${request.getEndpoint()}${requestPath}`;
      const method = operationInfos[0] as HttpMethod;
      const blobBatchSubRequest = new BlobBatchSubRequest(content_id!, url, method, operationInfos[2], {});

      ++lineIndex;
      while (lineIndex < requestLines.length) {
        if (requestLines[lineIndex] === '') break; // Last line
        const header = requestLines[lineIndex].split(HTTP_HEADER_DELIMITER, 2);

        if (header.length !== 2) throw new Error("Bad Request");
        blobBatchSubRequest.setHeader(header[0], header[1]);
        ++lineIndex;
      }
      const operation = await this.getSubRequestOperation(blobBatchSubRequest);
      if (operation !== Operation.Blob_Delete && operation !== Operation.Blob_SetTier) {
        throw new Error("Not supported operation");
      }

      if (previousOperation === undefined) {
        previousOperation = operation;
      }
      else if (operation !== previousOperation!) {
        throw new StorageError(
          400,
          "AllBatchSubRequestsShouldBeSameApi",
          "All batch subrequests should be the same api.",
          commonRequestId
        );
      }

      blobBatchSubRequests.push(blobBatchSubRequest);
    }

    if (blobBatchSubRequests.length === 0) {
      throw new Error("Bad Request");
    }

    return blobBatchSubRequests;
  }

  private serializeSubResponse(
    subResponsePrefix: string,
    responseEnding: string,
    subResponses: BlobBatchSubResponse[]): string {
    let responseBody = "";
    subResponses.forEach(subResponse => {
      responseBody += subResponsePrefix,
        responseBody += "Content-Type: application/http" + HTTP_LINE_ENDING;
      if (subResponse.content_id !== undefined) {
        responseBody += "Content-ID" + HTTP_HEADER_DELIMITER + subResponse.content_id.toString() + HTTP_LINE_ENDING;
      }
      responseBody += HTTP_LINE_ENDING;

      responseBody += subResponse.protocolWithVersion + " " + subResponse.getStatusCode().toString() + " "
        + subResponse.getStatusMessage() + HTTP_LINE_ENDING;

      const headers = subResponse.getHeaders();
      for (const key of Object.keys(headers)) {
        responseBody += key + HTTP_HEADER_DELIMITER + headers[key] + HTTP_LINE_ENDING;
      }

      const bodyContent = subResponse.getBodyContent();
      if (bodyContent !== "") {
        responseBody += HTTP_LINE_ENDING + bodyContent + HTTP_LINE_ENDING;
      }
      responseBody += HTTP_LINE_ENDING;
    });

    responseBody += responseEnding;
    return responseBody;
  }

  public async submitBatch(
    body: NodeJS.ReadableStream,
    requestBatchBoundary: string,
    subRequestPathPrefix: string,
    batchRequest: IRequest,
    context: Context
  ): Promise<string> {
    const perRequestPrefix = `--${requestBatchBoundary}${HTTP_LINE_ENDING}`;
    const batchRequestEnding = `--${requestBatchBoundary}--`

    const requestBody = await this.requestBodyToString(body);
    let subRequests: BlobBatchSubRequest[] | undefined;
    let error: any | undefined;
    try {
      subRequests = await this.parseSubRequests(
        context.contextId!,
        perRequestPrefix,
        batchRequestEnding,
        subRequestPathPrefix,
        batchRequest,
        requestBody);
    } catch (err) {
      if ((err instanceof MiddlewareError)
        && err.hasOwnProperty("storageErrorCode")
        && err.hasOwnProperty("storageErrorMessage")
        && err.hasOwnProperty("storageRequestID")) {
        error = err;
      }
      else {
        error = new StorageError(
          400,
          "InvalidInput",
          "One of the request inputs is not valid.",
          context.contextId!
        );
      }
    }

    const subResponses: BlobBatchSubResponse[] = [];
    if (subRequests && subRequests.length > 256) {
      error = new StorageError(
        400,
        "ExceedsMaxBatchRequestCount",
        "The batch operation exceeds maximum number of allowed subrequests.",
        context.contextId!
      );
    }

    if (error) {
      this.logger.error(
        `BlobBatchHandler: ${error.message}`,
        context.contextId
      );
      const errorResponse = new BlobBatchSubResponse(undefined, "HTTP/1.1");
      await this.HandleOneFailedRequest(error, batchRequest, errorResponse);
      subResponses.push(errorResponse);
    }
    else {
      for (const subRequest of subRequests!) {
        this.logger.info(
          `BlobBatchHandler: starting on subrequest ${subRequest.content_id}`,
          context.contextId
        );
        const subResponse = new BlobBatchSubResponse(subRequest.content_id, subRequest.protocolWithVersion);
        await this.HandleOneSubRequest(subRequest,
          subResponse);
        subResponses.push(subResponse);
        this.logger.info(
          `BlobBatchHandler: completed on subrequest ${subRequest.content_id} ${subResponse.getHeader("x-ms-request-id")}`,
          context.contextId
        );
      }
    }

    return this.serializeSubResponse(perRequestPrefix, batchRequestEnding, subResponses);
  }

  private HandleOneSubRequest(request: IRequest,
    response: IResponse): Promise<void> {
    const subRequestHandlePipeline = this.handlePipeline;
    const subRequestErrorHandler = this.errorHandler;
    let completed: boolean = false;
    return new Promise((resolve, reject) => {
      const locals: any = {};
      let i = 0;
      const next = (error: any) => {
        if (completed) {
          resolve();
          return;
        }

        if (error) {
          subRequestErrorHandler(error, request, response, locals, next);
          completed = true;
        }
        else {
          ++i;
          if (i < subRequestHandlePipeline.length) {
            subRequestHandlePipeline[i](request, response, locals, next);
          }
          else {
            resolve();
          }
        }
      };

      subRequestHandlePipeline[i](
        request,
        response,
        locals,
        next
      );
    });
  }

  private HandleOneFailedRequest(
    err: any,
    request: IRequest,
    response: IResponse
  ): Promise<void> {
    const subRequestErrorHandler = this.errorHandler;
    return new Promise((resolve, reject) => {
      subRequestErrorHandler(err, request, response, {}, resolve);
    });
  }
}