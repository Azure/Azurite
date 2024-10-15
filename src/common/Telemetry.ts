import TelemetryClient from "applicationinsights/out/Library/TelemetryClient";
import Context from "../blob/generated/Context";
import {Operation as BlobOperation} from "../blob/generated/artifacts/operation";
import { Contracts } from "applicationinsights";
import { createHash } from "crypto";
import * as fs from "fs";
import uuid from "uuid";
import { join } from "path";
//import {Operation as QueueOperation} from "../queue/generated/artifacts/operation";
//import {Operation as TableOperation} from "../table/generated/artifacts/operation";

export class AzuriteTelemetryClient {
  private static eventClient : TelemetryClient | undefined;
  private static requestClient : TelemetryClient | undefined;

  private static enableTelemetry: boolean = true;
  private static location: string;
  private static configFileName = "AzuriteConfig";
  //private _totalSize: number = 0;
  private _totalBlobRequestCount: number = 0;
  private _totalQueueRequestCount: number = 0;
  private _totalTableRequestCount: number = 0;

  private static sessionID = uuid();
  private static instanceID = "";

  public static init(location: string, enableTelemetry: boolean) {
   //TODO: check in VSCODE extension
    AzuriteTelemetryClient.enableTelemetry = enableTelemetry;

    if (enableTelemetry !== false)
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

  public static TraceRequest(context: Context) {
    if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.requestClient !== undefined)
    {
      AzuriteTelemetryClient.requestClient.trackRequest(
        {
          name:BlobOperation[context.operation??0], 
          // From privacy review, we will not collect url
          // url:"", 
          url:AzuriteTelemetryClient.GetRequestUri(context), 
          duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
          resultCode:context.response?.getStatusCode()??0, 
          success:true, 
          id: context.contextId,
          source: context.request?.getHeader("user-agent"),
          properties: 
          {
            //userAgent: context.request?.getHeader("user-agent"),
            apiVersion: "v"+context.request?.getHeader("x-ms-version"),
            authorization: AzuriteTelemetryClient.GetRequestAuthentication(context),
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
        /*
        AzuriteTelemetryClient.requestClient.trackPageView(
          {
            name:BlobOperation[context.operation??0], 
            duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
            properties: 
              {
                //userAgent: context.request?.getHeader("user-agent"),
                apiVersion: "v"+context.request?.getHeader("x-ms-version"),
                authorization: AzuriteTelemetryClient.GetRequestAuthentication(context),
              }            
          }
        )
        */
    }
  }

  public static TraceStartEvent() {
    if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.eventClient !== undefined)
    {
      // TODO: record Azurite instance ID (GUID) in customProperty, to get how many Azurite instance are installed.
      AzuriteTelemetryClient.eventClient.trackEvent({name: "Azurite Start event", 
        properties: 
        {
          instanceID: AzuriteTelemetryClient.instanceID,
          sessionID: AzuriteTelemetryClient.sessionID,
        }
      });
    }
  }

  public static TraceStopEvent() {
    if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.eventClient !== undefined)
    {
      AzuriteTelemetryClient.eventClient.trackEvent({name: `Azurite Stop event`, 
      properties: 
      {
        instanceID: AzuriteTelemetryClient.instanceID,
        sessionID: AzuriteTelemetryClient.sessionID,
      }
    });
    }
  }

  private static GetRequestUri(context: Context): string {
    if (context.request !== undefined)
    {
      let uri = new URL(context.request.getEndpoint());
      if(uri.hostname != "127.0.0.1" && uri.hostname != "localhost")
        {
          return context.request.getEndpoint().replace(uri.hostname, "[hidden]");
        }
        else
        {
          return context.request.getEndpoint();
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
    return "";
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
  private static GetRequestAuthentication(context: Context): string {
    let auth = context.request?.getHeader("authorization")?.split(" ")[0];
    if (auth === undefined)
    {
      if (context.request!.getQuery("sig") !== undefined)
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