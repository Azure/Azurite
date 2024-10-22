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
  //private static _totalSize: number = 0;
  private static _totalBlobRequestCount: number = 0;
  //private static _totalQueueRequestCount: number = 0;
  //private static _totalTableRequestCount: number = 0;

  private static sessionID = uuid();
  private static instanceID = "";
  private static initialized = false;

  public static init(location: string, enableTelemetry: boolean) {
    try{
      //TODO: check in VSCODE extension
      AzuriteTelemetryClient.enableTelemetry = enableTelemetry;

      if (enableTelemetry !== false && AzuriteTelemetryClient.initialized != true)
      {
        //Get instaceID and sessionID
        //TODO: need check if this works on VScode extension
        AzuriteTelemetryClient.location = location;
        AzuriteTelemetryClient.instanceID = AzuriteTelemetryClient.GetInstanceID();

        AzuriteTelemetryClient.enableTelemetry = enableTelemetry;
        if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.eventClient === undefined)
        {
          this.eventClient = AzuriteTelemetryClient.createAppInsigntClient("AzuriteTest", 100);
        }
        if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.requestClient === undefined)
        {
          //TODO: change to 1% in product
          this.requestClient = AzuriteTelemetryClient.createAppInsigntClient("AzuriteTest", 100);
        }
        
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
    //var data = envelope.data.baseData;
    // envelope.tags["ai.cloud.role"] = "";
    envelope.tags["ai.cloud.roleInstance"] = createHash('sha256').update(envelope.tags["ai.cloud.roleInstance"]).digest('hex');

    // per privacy review, we will not collect operation name as it contains request path
    envelope.tags["ai.operation.name"] = "";

    return true;
  }
    

  public static createAppInsigntClient(cloudRole:string, samplingPercentage:number|undefined) : TelemetryClient 
  {
    const ConnectionString = 'InstrumentationKey=feb4ae36-1db7-4808-abaa-e0b94996d665;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/;ApplicationId=9af871a3-75b5-417c-8a2f-7f2eb1ba6a6c';
    let appInsights = require('applicationinsights');

    // disable default logging
    var appConfig = appInsights.setup(ConnectionString)
      .setAutoCollectRequests(false)
      .setAutoCollectPerformance(false)
      .setAutoCollectExceptions(false)
      .setAutoCollectDependencies(false)
      .setAutoCollectConsole(false)
      .setAutoCollectHeartbeat(false)
      .setAutoCollectConsole(false);

    // Remove some default telemetry item in the telemetry envelope 
    appInsights.defaultClient.addTelemetryProcessor(AzuriteTelemetryClient.removeRoleInstance);
    appInsights.start();


    if (appInsights.defaultClient !== undefined)
    {
      appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = "AzuriteTest";
    }
    
    appInsights.defaultClient.config.samplingPercentage = samplingPercentage??100;
  
    // For development only, make  your telemetry to be sent as soon as it's collected.
    appConfig.setInternalLogging(true, true);
    appInsights.defaultClient.config.maxBatchSize = 0;
  
    appInsights.start();

    return appInsights.defaultClient;
  }

  public static TraceBlobRequest(context: BlobContext) {
    try{
      if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.requestClient !== undefined)
      {
        AzuriteTelemetryClient._totalBlobRequestCount++;
        AzuriteTelemetryClient.requestClient.trackRequest(
          {
            name:"B_" + BlobOperation[context.operation??0], 
            url:context.request !== undefined ? AzuriteTelemetryClient.GetRequestUri(context.request.getEndpoint()) : "",  
            duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
            resultCode:context.response?.getStatusCode()??0, 
            success:true, 
            id: context.contextId,
            source: context.request?.getHeader("user-agent"),
            properties: 
            {
              apiVersion: "v"+context.request?.getHeader("x-ms-version"),
              authorization: context.request !== undefined ? AzuriteTelemetryClient.GetRequestAuthentication(context.request.getHeader("authorization"), context.request.getQuery("sig")) : "",
              requestContentSize: context.request?.getBody.length,
              instanceID: AzuriteTelemetryClient.instanceID,
              sessionID: AzuriteTelemetryClient.sessionID,
              totalReqs:AzuriteTelemetryClient._totalBlobRequestCount,
            },
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
        AzuriteTelemetryClient.requestClient.trackRequest(
          {
            name:"Q_" + QueueOperation[context.operation??0], 
            url:context.request !== undefined ? AzuriteTelemetryClient.GetRequestUri(context.request.getEndpoint()) : "", 
            duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
            resultCode:context.response?.getStatusCode()??0, 
            success:true, 
            id: context.contextID,
            source: context.request?.getHeader("user-agent"),
            properties: 
            {
              apiVersion: "v"+context.request?.getHeader("x-ms-version"),
              authorization: context.request !== undefined ? AzuriteTelemetryClient.GetRequestAuthentication(context.request.getHeader("authorization"), context.request.getQuery("sig")) : "",
              requestContentSize: context.request?.getBody.length,
              instanceID: AzuriteTelemetryClient.instanceID,
              sessionID: AzuriteTelemetryClient.sessionID,
            },
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
        AzuriteTelemetryClient.requestClient.trackRequest(
          {
            name:"T_" + TableOperation[context.operation??0], 
            url:context.request !== undefined ? AzuriteTelemetryClient.GetRequestUri(context.request.getEndpoint()) : "", 
            duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
            resultCode:context.response?.getStatusCode()??0, 
            success:true, 
            id: context.contextID,
            source: context.request?.getHeader("user-agent"),
            properties: 
            {
              apiVersion: "v"+context.request?.getHeader("x-ms-version"),
              authorization: context.request !== undefined ? AzuriteTelemetryClient.GetRequestAuthentication(context.request.getHeader("authorization"), context.request.getQuery("sig")) : "",
              requestContentSize: context.request?.getBody.length,
              instanceID: AzuriteTelemetryClient.instanceID,
              sessionID: AzuriteTelemetryClient.sessionID,
            },
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

  public static TraceStartEvent(serviceType: string = "") {
    try{
      if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.eventClient !== undefined)
      {
        AzuriteTelemetryClient.eventClient.trackEvent({name: 'Azurite Start' + (serviceType === "" ? "" : ": " + serviceType), 
          properties: 
          {
            instanceID: AzuriteTelemetryClient.instanceID,
            sessionID: AzuriteTelemetryClient.sessionID,
            // TODO: Add start Parameters
          }
        });
      }
      logger.info('Send start telemetry');
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
          }
        });
      }
      logger.info('Send stop telemetry');
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


  private static GetInstanceID(): string {
    const configFilePath = join(
      AzuriteTelemetryClient.location,
      AzuriteTelemetryClient.configFileName
    );

    //const fs = require('fs');
    let instaceID = "";
    try {
      if(!fs.existsSync(configFilePath))
        {
          instaceID = uuid();
          fs.writeFile(configFilePath, instaceID, (err) => {
            //TODO: write warning for write file failed.
          });
        }
        else{

          var data = fs.readFileSync(configFilePath, 'utf8');
          instaceID = data.toString();
          if(instaceID === "")
          {
            instaceID = uuid();
            fs.writeFile(configFilePath, instaceID, (err) => {
              //TODO: write warning for write file failed.
            });
          }

          // fs.readFile(configFilePath, function (err, data) {
          //   if (!err)
          //   {
          //     instaceID = data.toString();
          //   }
          //   else
          //   {
          //     instaceID = uuid();
          //     fs.writeFile(configFilePath, instaceID, (err) => {
          //       //TODO: write warning for write file failed.
          //     });
          //   }
          // });
        }
      return instaceID;
    } catch {
      // TODO: Add warning log for instanceID is empty
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
}