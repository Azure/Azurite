import TelemetryClient from "applicationinsights/out/Library/TelemetryClient";
import {default as BlobContext}  from "../blob/generated/Context";
import {default as QueueContext}  from "../queue/generated/Context";
import {default as TableContext}  from "../table/generated/Context";
import {Operation as BlobOperation} from "../blob/generated/artifacts/operation";
import {Operation as QueueOperation} from "../queue/generated/artifacts/operation";
import {Operation as TableOperation} from "../table/generated/artifacts/operation";
import { Contracts } from "applicationinsights";
import { createHash } from "crypto";
import * as fs from "fs";
import uuid from "uuid";
import { join } from "path";
import logger from "./Logger";

export class AzuriteTelemetryClient {
  private static eventClient : TelemetryClient | undefined;
  private static requestClient : TelemetryClient | undefined;

  private static enableTelemetry: boolean = true;
  private static location: string;
  private static configFileName = "AzuriteConfig";
  private static _totalIngressSize: number = 0;
  //private static _totalEgressSize: number = 0;
  private static _totalBlobRequestCount: number = 0;
  private static _totalQueueRequestCount: number = 0;
  private static _totalTableRequestCount: number = 0;

  private static sessionID = uuid();
  private static instanceID = "";
  private static initialized = false;
  private static env: any = undefined;
  public static envAccountIsSet = false;
  public static envDBIsSet = false;
  public static isVSC = false;

  // Debug options
  private static  isDebug = false;
  private static requestCollectPercentage = AzuriteTelemetryClient.isDebug ? 100 : 1;
  private static enableAppInsightLog = AzuriteTelemetryClient.isDebug? true : false;
  private static cloudRole = AzuriteTelemetryClient.isDebug ? "AzuriteTest" : "Azurite";
  // 0 means send as soon as it's collected, use it in both debug and release mode, since set any other value will make Azurite exist slower
  private static requestMaxBatchSize = AzuriteTelemetryClient.isDebug ? 0 : 0; 


  private static appInsights = require('applicationinsights');

  public static init(location: string, enableTelemetry: boolean, env: any, isVSC: boolean = false) {
    try{
      AzuriteTelemetryClient.enableTelemetry = enableTelemetry;

      if (enableTelemetry !== false && AzuriteTelemetryClient.initialized != true)
      {
        AzuriteTelemetryClient.isVSC = isVSC;
        AzuriteTelemetryClient.location = location;
        AzuriteTelemetryClient.instanceID = AzuriteTelemetryClient.GetInstanceID(typeof env?.inMemoryPersistence === "function" && env?.inMemoryPersistence());

        AzuriteTelemetryClient.enableTelemetry = enableTelemetry;
        AzuriteTelemetryClient.env = env;
        if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.eventClient === undefined)
        {
          // for start/stop event, will collect 100%, and send asap
          this.eventClient = AzuriteTelemetryClient.createAppInsigntClient(AzuriteTelemetryClient.cloudRole, 100, 0);
        }
        if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.requestClient === undefined)
        {
          this.requestClient = AzuriteTelemetryClient.createAppInsigntClient(AzuriteTelemetryClient.cloudRole, AzuriteTelemetryClient.requestCollectPercentage, AzuriteTelemetryClient.requestMaxBatchSize);
        }
  
        AzuriteTelemetryClient.appInsights.start();        
        AzuriteTelemetryClient.initialized = true;
        logger.info('Telemetry initialize successfully.');
      }
      else
      {
        logger.info('Don\'t need initialize Telemetry. enableTelemetry: ' + enableTelemetry + ", initialized: " + AzuriteTelemetryClient.initialized);

      }
    }
    catch (e)
    {
      logger.warn('Fail to init telemetry, error: ' + e.message);
    }
  }

  private static removeRoleInstance ( envelope: Contracts.EnvelopeTelemetry) : boolean {
    // per privacy review, will not collect roleInstance name
    envelope.tags["ai.cloud.roleInstance"] = createHash('sha256').update(envelope.tags["ai.cloud.roleInstance"]).digest('hex');

    // per privacy review, we will not collect operation name as it contains request path
    envelope.tags["ai.operation.name"] = "";

    return true;
  }
    

  public static createAppInsigntClient(cloudRole:string, samplingPercentage:number|undefined, maxBatchSize:number|undefined) : TelemetryClient 
  {
    // Xclient APP: AzuriteTelemetryProd
    //const ConnectionString = 'InstrumentationKey=feb4ae36-1db7-4808-abaa-e0b94996d665;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/;ApplicationId=9af871a3-75b5-417c-8a2f-7f2eb1ba6a6c';
    
    //weiapp
    const ConnectionString = 'InstrumentationKey=40e81e8c-36af-4cf3-b46e-a7d67ecb5628;IngestionEndpoint=https://westus-0.in.applicationinsights.azure.com/;LiveEndpoint=https://westus.livediagnostics.monitor.azure.com/;ApplicationId=edbe156f-ede6-4c39-b948-0c0c638c7004'
    
    // disable default logging
    let appConfig = AzuriteTelemetryClient.appInsights.setup(ConnectionString);
    appConfig.setAutoCollectRequests(false)
      .setAutoCollectPerformance(false)
      .setAutoCollectExceptions(false)
      .setAutoCollectDependencies(false)
      .setAutoCollectConsole(false)
      .setAutoCollectHeartbeat(false)
      .setAutoCollectConsole(false);

    // Remove some default telemetry item in the telemetry envelope 
    let telemetryClient = new AzuriteTelemetryClient.appInsights.TelemetryClient(ConnectionString);
    telemetryClient.addTelemetryProcessor(AzuriteTelemetryClient.removeRoleInstance);
    //appInsights.start();


    if (telemetryClient !== undefined)
    {
      telemetryClient.context.tags[telemetryClient.context.keys.cloudRole] = "AzuriteTest";
    }
    
    telemetryClient.config.samplingPercentage = samplingPercentage??100;
  
    // Enable AppInsight log, should enable in develoipment only
    if (AzuriteTelemetryClient.enableAppInsightLog)
    {
      appConfig.setInternalLogging(true, true);
    }
    if (maxBatchSize !== undefined)
    {
      telemetryClient.config.maxBatchSize = maxBatchSize??0;
    }

    return telemetryClient;
  }

  public static TraceBlobRequest(context: BlobContext) {
    try{
      if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.requestClient !== undefined)
      {
        AzuriteTelemetryClient._totalBlobRequestCount++;
        let requestProperties: { [key: string]: any } = {
          apiVersion: "v"+context.request?.getHeader("x-ms-version"),
          authorization: context.request !== undefined ? AzuriteTelemetryClient.GetRequestAuthentication(context.request.getHeader("authorization"), context.request.getQuery("sig")) : "",
          instanceID: AzuriteTelemetryClient.instanceID,
          sessionID: AzuriteTelemetryClient.sessionID,
          //totalReqs:AzuriteTelemetryClient._totalBlobRequestCount,
        };
        if (context.request?.getHeader("content-length") !== undefined)
        {
          const contentLength = context.request?.getHeader("content-length");
          if (contentLength && parseInt(contentLength)) {
            requestProperties["requestContentSize"] = contentLength;
            this._totalIngressSize += parseInt(contentLength);
          }
        }
        // Responds "content-length" Not work, as responds normally don't have "content-length" header even has body.

        AzuriteTelemetryClient.requestClient.trackRequest(
          {
            name:"B_" + BlobOperation[context.operation??0], 
            url:context.request !== undefined ? AzuriteTelemetryClient.GetRequestUri(context.request.getEndpoint()) : "",  
            duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
            resultCode:context.response?.getStatusCode()??0, 
            success:context.response?.getStatusCode()?.toString().startsWith("2")??false,
            // Question: should we move InstanceID and SessionID to telemetry properties id & source, and move requestID and useragent to properties (customDimensions)?
            id: context.contextId, // Request ID
            source: context.request?.getHeader("user-agent"), // User Agent
            properties: requestProperties,
            contextObjects:
            {
              operationId: "",
              operationParentId: "",
              operationName: "test",
              operation_Name: "test",
              appName: ""
            }
          });
      }
      logger.verbose('Send blob telemetry: ' + BlobOperation[context.operation??0], context.contextId);
    }
    catch (e)
    {
      logger.warn('Fail to telemetry a blob request, error: ' + e.message);
    }
  }

  public static TraceQueueRequest(context: QueueContext) {
    try{
      if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.requestClient !== undefined)
      {
        AzuriteTelemetryClient._totalQueueRequestCount++;
        let requestProperties: { [key: string]: any } = {
          apiVersion: "v"+context.request?.getHeader("x-ms-version"),
          authorization: context.request !== undefined ? AzuriteTelemetryClient.GetRequestAuthentication(context.request.getHeader("authorization"), context.request.getQuery("sig")) : "",
          instanceID: AzuriteTelemetryClient.instanceID,
          sessionID: AzuriteTelemetryClient.sessionID,
          //totalReqs:AzuriteTelemetryClient._totalQueueRequestCount,
        };
        if (context.request?.getHeader("content-length") !== undefined)
        {
          requestProperties["requestContentSize"] = context.request?.getHeader("content-length");
        }
        AzuriteTelemetryClient.requestClient.trackRequest(
          {
            name:"Q_" + QueueOperation[context.operation??0], 
            url:context.request !== undefined ? AzuriteTelemetryClient.GetRequestUri(context.request.getEndpoint()) : "", 
            duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
            resultCode:context.response?.getStatusCode()??0, 
            success:context.response?.getStatusCode()?.toString().startsWith("2")??false,
            id: context.contextID,
            source: context.request?.getHeader("user-agent"),
            properties: requestProperties,
            contextObjects:
            {
              operationId: "",
              operationParentId: "",
              operationName: "test",
              operation_Name: "test",
              appName: ""
            }
          });
      }
      logger.verbose('Send queue telemetry: ' + QueueOperation[context.operation??0], context.contextID);
    }
    catch (e)
    {
      logger.warn('Fail to telemetry a queue request, error: ' + e.message);
    }
  }

  public static TraceTableRequest(context: TableContext) {
    try{
      if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.requestClient !== undefined)
      {
        AzuriteTelemetryClient._totalTableRequestCount++;
        let requestProperties: { [key: string]: any } = {
          apiVersion: "v"+context.request?.getHeader("x-ms-version"),
          authorization: context.request !== undefined ? AzuriteTelemetryClient.GetRequestAuthentication(context.request.getHeader("authorization"), context.request.getQuery("sig")) : "",
          instanceID: AzuriteTelemetryClient.instanceID,
          sessionID: AzuriteTelemetryClient.sessionID,
          // totalReqs:AzuriteTelemetryClient._totalTableRequestCount,
        };
        if (context.request?.getHeader("content-length") !== undefined)
        {
          requestProperties["requestContentSize"] = context.request?.getHeader("content-length");
        }
        AzuriteTelemetryClient.requestClient.trackRequest(
          {
            name:"T_" + TableOperation[context.operation??0], 
            url:context.request !== undefined ? AzuriteTelemetryClient.GetRequestUri(context.request.getEndpoint()) : "", 
            duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
            resultCode:context.response?.getStatusCode()??0, 
            success:context.response?.getStatusCode()?.toString().startsWith("2")??false,
            id: context.contextID,
            source: context.request?.getHeader("user-agent"),
            properties: requestProperties,
            contextObjects:
            {
              operationId: "",
              operationParentId: "",
              operationName: "test",
              operation_Name: "test",
              appName: ""
            }
          });
      }
      logger.verbose('Send table telemetry: ' + TableOperation[context.operation??0], context.contextID);
    }
    catch (e)
    {
      logger.warn('Fail to telemetry a table request, error: ' + e.message);
    }
  }

  public static async TraceStartEvent(serviceType: string = "") {
    try{
      if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.eventClient !== undefined)
      {        
        AzuriteTelemetryClient.eventClient.trackEvent({name: 'Azurite Start' + (serviceType === "" ? "" : ": " + serviceType), 
          properties: 
          {
            instanceID: AzuriteTelemetryClient.instanceID,
            sessionID: AzuriteTelemetryClient.sessionID,
            parameters: await AzuriteTelemetryClient.GetAllParameterString()
          }
        });
      }
      logger.verbose('Send start telemetry');
    }
    catch (e)
    {
      logger.warn('Fail to send start telemetry, error: ' + e.message);
    }
  }

  public static TraceStopEvent(serviceType: string = "") {
    try{
      if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.eventClient !== undefined)
      {
        AzuriteTelemetryClient.eventClient.trackEvent({name: 'Azurite Stop' + (serviceType === "" ? "" : ": " + serviceType), 
          properties: 
          {
            instanceID: AzuriteTelemetryClient.instanceID,
            sessionID: AzuriteTelemetryClient.sessionID,
            blobRequest: AzuriteTelemetryClient._totalBlobRequestCount,
            queueRequest: AzuriteTelemetryClient._totalQueueRequestCount,
            tableRequest: AzuriteTelemetryClient._totalTableRequestCount,
            totalIngress: this._totalIngressSize,
          }
        });
      }
      logger.verbose('Send stop telemetry');
    }
    catch (e)
    {
      logger.warn('Fail to send stop telemetry, error: ' + e.message);
    }
  }

  private static GetRequestUri(endpoint: string): string {
    //From privacy review, won't return the whole Uri
    let uri = new URL(endpoint);
    let knownHosts = ["127.0.0.1","localhost","host.docker.internal"];
    if(uri.hostname.toLowerCase() in knownHosts)
    {
      return endpoint.replace(uri.hostname, "[hidden]");
    }
    else
    {
      return endpoint;
    }

    // let request = context.request;
    // let requestUri = request.getUrl();
    // let sig = request.getQuery("sig");
    // if (sig!=undefined)
    // {
    //   requestUri = requestUri.replace(encodeURIComponent(sig), "[hidden]");
    // }
    // return `${request.getEndpoint()}${requestUri}`;
  }


  private static GetInstanceID(inMemoryPersistence : boolean = false): string {
    const configFilePath = join(
      AzuriteTelemetryClient.location,
      AzuriteTelemetryClient.configFileName
    );

    let instaceID = "";
    if (inMemoryPersistence)
    {
      return uuid();
    }
    try {
      if(!fs.existsSync(configFilePath))
        {
          instaceID = uuid();
          fs.writeFile(configFilePath, `{"instaceID":"${instaceID}"}`, (err) => {
            logger.warn('Fail to save instaceID, error: ' + err?.message);
          });
        }
        else{

          let data = fs.readFileSync(configFilePath, 'utf8');
          instaceID = JSON.parse(data.toString()).instaceID;
          if(instaceID === "")
          {
            instaceID = uuid();
            fs.writeFile(configFilePath, instaceID, (err) => {
              logger.warn('Fail to save instaceID, error: ' + err?.message);
            });
          }
        }
      return instaceID;
    } catch (e) {
      logger.warn('Fail to generate and save instaceID will use empty instaceID, error: ' + e.message);
      return instaceID;
    }
  }
  
  private static GetRequestAuthentication(authorizationHeader: string|undefined, sigQuery: string|undefined): string {
    let auth = authorizationHeader?.split(" ")[0];
    if (auth === undefined)
    {
      if (sigQuery !== undefined)
      {
        auth = "Sas";
      }
      else
      {
        auth = "Anonymous";
      }
    }
    return auth;
  }

  private static async GetAllParameterString(): Promise<string> {
    let parameters = "";
    if (this.envAccountIsSet)
    {
      parameters += "AZURITE_ACCOUNTS,";
    }
    if (this.envDBIsSet)
    {
      parameters += "AZURITE_DB,";
    }
    if (AzuriteTelemetryClient.env === undefined)
    {
      return parameters;
    }
    let longParameters = ["blobHost","queueHost","tableHost","blobPort","queuePort","tablePort","blobKeepAliveTimeout","queueKeepAliveTimeout","tableKeepAliveTimeout","location","cert","key","pwd","oauth","extentMemoryLimit","debug","silent","loose","skipApiVersionCheck","disableProductStyleUrl","inMemoryPersistence","disableTelemetry"];
    let shortParameters: { [string: string]: any }  = {"d": "debug", "l": "location", "L": "loose", "s": "silent"};

    if (AzuriteTelemetryClient.isVSC) // VSC
    {
      let workspaceConfiguration = AzuriteTelemetryClient.env;
      if (workspaceConfiguration === undefined)
      {
        return parameters;
      }
      else
      {
        longParameters.forEach((flag) => {
          let value = workspaceConfiguration.get(flag);
          if (value !== undefined && value !== "" && value !== false && value !== null
            && !(flag.endsWith("Host") && value === "localhost")
            && !(flag.endsWith("KeepAliveTimeout") && value === 5)
            && !(flag == "blobPort" && value === 10000)
            && !(flag == "queuePort" && value === 10001)
            && !(flag == "tablePort" && value === 10002))
          {
            parameters += flag + ",";
          }
        });
      }
    }
    else // npm (exe, docker)
    {
      process.argv.forEach((val, index) => {  
        if (val.startsWith("--"))
        {      
          longParameters.forEach((flag) => {
            if (val.toLowerCase() === (`--${flag}`).toLowerCase())
            {
              parameters += flag + ",";
            }
          });
        }
        else if(val.startsWith("-")) {
          if(shortParameters[val.substring(1)] !== undefined)
          {
            parameters += shortParameters[val.substring(1)] + ",";
          }
        }
      });
    }

    // if (typeof AzuriteTelemetryClient.env?.blobHost === "function" && AzuriteTelemetryClient.env?.blobHost() !== undefined && AzuriteTelemetryClient.env?.blobHost() !== "127.0.0.1")
    // {
    //   parameters += "blobHost,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.queueHost === "function" && AzuriteTelemetryClient.env?.queueHost() !== undefined && AzuriteTelemetryClient.env?.queueHost() !== "127.0.0.1")
    // {
    //   parameters += "queueHost,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.tableHost === "function" && AzuriteTelemetryClient.env?.tableHost() !== undefined && AzuriteTelemetryClient.env?.tableHost() !== "127.0.0.1")
    // {
    //   parameters += "tableHost,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.blobPort === "function" && AzuriteTelemetryClient.env?.blobPort() !== undefined && AzuriteTelemetryClient.env?.blobPort() !== 10000)
    // {
    //   parameters += "blobPort,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.queuePort === "function" && AzuriteTelemetryClient.env?.queuePort() !== undefined && AzuriteTelemetryClient.env?.queuePort() !== 10001)
    // {
    //   parameters += "queuePort,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.tablePort === "function" && AzuriteTelemetryClient.env?.tablePort() !== undefined && AzuriteTelemetryClient.env?.tablePort() !== 10002)
    // {
    //   parameters += "tablePort,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.blobKeepAliveTimeout === "function" && AzuriteTelemetryClient.env?.blobKeepAliveTimeout() !== undefined && AzuriteTelemetryClient.env?.blobKeepAliveTimeout() !== 5)
    // {
    //   parameters += "blobKeepAliveTimeout,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.queueKeepAliveTimeout === "function" && AzuriteTelemetryClient.env?.queueKeepAliveTimeout() !== undefined && AzuriteTelemetryClient.env?.queueKeepAliveTimeout() !== 5)
    // {
    //   parameters += "queueKeepAliveTimeout,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.tableKeepAliveTimeout === "function" && AzuriteTelemetryClient.env?.tableKeepAliveTimeout() !== undefined && AzuriteTelemetryClient.env?.tableKeepAliveTimeout() !== 5)
    // {
    //   parameters += "tableKeepAliveTimeout,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.location === "function" && (await AzuriteTelemetryClient.env?.location()) !== undefined)
    // {
    //   parameters += "location,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.silent === "function" && AzuriteTelemetryClient.env?.silent())
    // {
    //   parameters += "silent,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.loose === "function" && AzuriteTelemetryClient.env?.loose())
    // {
    //   parameters += "loose,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.skipApiVersionCheck === "function" && AzuriteTelemetryClient.env?.skipApiVersionCheck())
    // {
    //   parameters += "skipApiVersionCheck,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.disableProductStyleUrl === "function" && AzuriteTelemetryClient.env?.disableProductStyleUrl())
    // {
    //   parameters += "disableProductStyleUrl,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.cert === "function" && AzuriteTelemetryClient.env?.cert() !== undefined)
    // {
    //   parameters += "cert,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.key === "function" && AzuriteTelemetryClient.env?.key() !== undefined)
    // {
    //   parameters += "key,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.pwd === "function" && AzuriteTelemetryClient.env?.pwd() !== undefined)
    // {
    //   parameters += "pwd,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.oauth === "function" && AzuriteTelemetryClient.env?.oauth() !== undefined)
    // {
    //   parameters += "oauth,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.inMemoryPersistence === "function" && AzuriteTelemetryClient.env?.inMemoryPersistence())
    // {
    //   parameters += "inMemoryPersistence,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.extentMemoryLimit === "function" && AzuriteTelemetryClient.env?.extentMemoryLimit() !== undefined)
    // {
    //   parameters += "extentMemoryLimit,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.disableTelemetry === "function" && AzuriteTelemetryClient.env?.disableTelemetry())
    // {
    //   parameters += "disableTelemetry,";
    // }
    // if (typeof AzuriteTelemetryClient.env?.debug === "function" && (await AzuriteTelemetryClient.env?.debug()) !== undefined)
    // {
    //   parameters += "debug,";
    // }
    return parameters.endsWith(",") ? parameters.substring(0, parameters.length - 1) : parameters;
  }
}