import TelemetryClient from "applicationinsights/out/Library/TelemetryClient";
import Context from "../blob/generated/Context";
import {Operation as BlobOperation} from "../blob/generated/artifacts/operation";
import { Contracts } from "applicationinsights";
import { createHash } from "crypto";
//import {Operation as QueueOperation} from "../queue/generated/artifacts/operation";
//import {Operation as TableOperation} from "../table/generated/artifacts/operation";

export class AzuriteTelemetryClient {
  private static eventClient : TelemetryClient | undefined;
  private static requestClient : TelemetryClient | undefined;

  private static enableTelemetry: boolean = true;
  //private _totalSize: number = 0;

  public static init(enableTelemetry?: boolean) {
    
   
    if (enableTelemetry !== undefined)
    {
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

    return true;
  }
    

  public static createAppInsigntClient(cloudRole:string, samplingPercentage:number|undefined) : TelemetryClient 
  {
    const ConnectionString = 'InstrumentationKey=28f7cfab-c2b3-44bf-b880-8af2d41f1783;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/';
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
            },
          contextObjects:
          {
            operationId: "",
            operationParentId: "",
            operationName: "test",
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
      AzuriteTelemetryClient.eventClient.trackEvent({name: "Azurite Start event", properties: {customProperty: "custom property value"}});
    }
  }

  public static TraceStopEvent() {
    if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.eventClient !== undefined)
    {
      AzuriteTelemetryClient.eventClient.trackEvent({name: "Azurite Stop event", properties: {customProperty: "custom property value"}});
    }
  }

  private static GetRequestUri(context: Context): string {
    if (context.request !== undefined)
    {
      let request = context.request;
      let requestUri = request.getUrl();
      let sig = request.getQuery("sig");
      if (sig!=undefined)
      {
        requestUri = requestUri.replace(encodeURIComponent(sig), "[hidden]");
      }
    return `${request.getEndpoint()}${requestUri}`;
    }
    return "";
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