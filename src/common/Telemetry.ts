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
import { DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT, DEFAULT_BLOB_LISTENING_PORT, DEFAULT_BLOB_SERVER_HOST_NAME } from "../blob/utils/constants";
import { DEFAULT_QUEUE_LISTENING_PORT } from "../queue/utils/constants";
import { DEFAULT_TABLE_LISTENING_PORT } from "../table/utils/constants";

export class AzuriteTelemetryClient {
  private static eventClient : TelemetryClient | undefined;
  private static requestClient : TelemetryClient | undefined;

  private static enableTelemetry: boolean = true;
  private static location: string;
  private static configFileName = "AzuriteConfig";
  private static _totalIngressSize: number = 0;
  private static _totalEgressSize: number = 0;
  private static _totalBlobRequestCount: number = 0;
  private static _totalQueueRequestCount: number = 0;
  private static _totalTableRequestCount: number = 0;

  private static sessionID = uuid();
  private static instanceID = "";
  private static initialized = false;
  private static env: any = undefined;
  public static isVSC = false;

  // Debug options
  private static  isDebug = false; // false in production, true in development
  private static requestCollectPercentage = AzuriteTelemetryClient.isDebug ? 100 : 1;
  private static enableAppInsightLog = AzuriteTelemetryClient.isDebug? true : false;
  private static cloudRole = AzuriteTelemetryClient.isDebug ? "AzuriteTest" : "Azurite_V1.0";
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
        logger.info(`InstaceID ${AzuriteTelemetryClient.instanceID}, SessionID ${AzuriteTelemetryClient.sessionID}.`);

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
    const ConnectionString = 'InstrumentationKey=feb4ae36-1db7-4808-abaa-e0b94996d665;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/;ApplicationId=9af871a3-75b5-417c-8a2f-7f2eb1ba6a6c';

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
 
    if (telemetryClient !== undefined)
    {
      telemetryClient.context.tags[telemetryClient.context.keys.cloudRole] = AzuriteTelemetryClient.cloudRole;
    }
    
    telemetryClient.config.samplingPercentage = samplingPercentage??1;
  
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

  public static TraceRequest(context: any) {
    let serviceType = "";
    let totalReqs = 0;
    let reqName = "";
    try{
      if (AzuriteTelemetryClient.enableTelemetry && AzuriteTelemetryClient.requestClient !== undefined)
      {
        if (context instanceof BlobContext)
        {
          serviceType = "Blob";
          AzuriteTelemetryClient._totalBlobRequestCount++;
          totalReqs = AzuriteTelemetryClient._totalBlobRequestCount;
          reqName = "B_" + BlobOperation[context.operation??0];
        }
        else if (context instanceof QueueContext)
        {
          serviceType = "Queue";
          AzuriteTelemetryClient._totalQueueRequestCount++;          
          totalReqs = AzuriteTelemetryClient._totalQueueRequestCount;
          reqName = "Q_" + QueueOperation[context.operation??0];
        }
        else if (context instanceof TableContext)
        {
          serviceType = "Table";
          AzuriteTelemetryClient._totalTableRequestCount++;
          totalReqs = AzuriteTelemetryClient._totalTableRequestCount;
          reqName = "T_" + TableOperation[context.operation??0];
        }
        let requestProperties: { [key: string]: any } = {
          apiVersion: "v"+context.request?.getHeader("x-ms-version"),
          authorization: context.request !== undefined ? AzuriteTelemetryClient.GetRequestAuthentication(context.request.getHeader("authorization"), context.request.getQuery("sig")) : "",
          instanceID: AzuriteTelemetryClient.instanceID,
          sessionID: AzuriteTelemetryClient.sessionID,
          ReqNo:totalReqs,
        };

        const ingress = context.request?.getHeader("content-length");
        if (ingress !== undefined)
          {
            if (ingress && parseInt(ingress)) {
              requestProperties["ingress"] = ingress;
              this._totalIngressSize += parseInt(ingress);
            }
          }

          // When body is xml or json, "content-length" header won't return even has body, so currently can't be caculated into egress in telemetry.
          // Head request don't has body but can has "content-length" header, like in GetBlobProperties "content-length" header means the blob length but not body length
          if (context.request?.getMethod() !== "HEAD")
          {
            const egress = context.response?.getHeader("content-length");
            if (egress !== undefined)
            {
              if (egress && parseInt(egress)) {
                requestProperties["egress"] = egress;
                this._totalEgressSize += parseInt(egress);
              }
            }
          }

        AzuriteTelemetryClient.requestClient.trackRequest(
        {
          name:reqName, 
          url:context.request !== undefined ? AzuriteTelemetryClient.GetRequestUri(context.request.getEndpoint()) : "",  
          duration:context.startTime?((new Date()).getTime() - context.startTime?.getTime()):0, 
          resultCode:context.response?.getStatusCode()??0, 
          success:(context.response?.getStatusCode() ?? 500) <= 399,
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

        logger.verbose(`Send ${serviceType} telemetry: ` + reqName, context.contextId === undefined ? context.contextID : context.contextId);
      }
    }
    catch (e)
    {
      logger.warn(`Fail to telemetry a ${serviceType} request, error: ` + e.message);
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
        logger.verbose('Send start telemetry');
      }
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
            totalIngress: AzuriteTelemetryClient._totalIngressSize,
            totalEgress: AzuriteTelemetryClient._totalEgressSize,
          }
        });
        logger.verbose('Send stop telemetry');
      }
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
        fs.writeFileSync(configFilePath, `{"instaceID":"${instaceID}"}`);
      }
      else{
        try{
          let data = fs.readFileSync(configFilePath, 'utf8');
          instaceID = JSON.parse(data.toString()).instaceID;
        }
        catch(e){
          logger.warn(`Failed to read instaceID from file ${configFilePath} and will regenerate instanceID, error: ` + e.message);
        }
        if(instaceID === undefined || instaceID === "")
        {
          instaceID = uuid();
          fs.writeFileSync(configFilePath, `{"instaceID":"${instaceID}"}`);
        }
      }
      return instaceID;
    } catch (e) {
      logger.warn(`Failed to read or generate/save instaceID, will use instaceID "${instaceID}", error: ` + e.message);
      return instaceID;
    }
  }
  
  private static GetRequestAuthentication(authorizationHeader: string|undefined, sigQuery: string|undefined): string {
    
    let auth = authorizationHeader?.split(" ")[0];
    if (auth !== undefined && auth !== "") 
    {
      if (sigQuery !== undefined)
      {
        auth = auth + ",Sas";
      }
      //else auth in head is already retrived, no need to add more
    }
    else // no auth header
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
    if (process.env.AZURITE_ACCOUNTS)
    {
      parameters += "AZURITE_ACCOUNTS,";
    }
    if (process.env.AZURITE_DB)
    {
      parameters += "AZURITE_DB,";
    }
    let longParameters = ["blobHost","queueHost","tableHost","blobPort","queuePort","tablePort","blobKeepAliveTimeout","queueKeepAliveTimeout","tableKeepAliveTimeout","location","cert","key","pwd","oauth","extentMemoryLimit","debug","silent","loose","skipApiVersionCheck","disableProductStyleUrl","inMemoryPersistence","disableTelemetry"];
    let shortParameters: { [string: string]: any }  = {"d": "debug", "l": "location", "L": "loose", "s": "silent"};

    if (AzuriteTelemetryClient.isVSC) // VSC
    {
      if (AzuriteTelemetryClient.env === undefined)
      {
        return parameters;
      }
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
            && !(flag.endsWith("Host") && value === DEFAULT_BLOB_SERVER_HOST_NAME)
            && !(flag.endsWith("KeepAliveTimeout") && value === DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT)
            && !(flag == "blobPort" && value === DEFAULT_BLOB_LISTENING_PORT)
            && !(flag == "queuePort" && value === DEFAULT_QUEUE_LISTENING_PORT)
            && !(flag == "tablePort" && value === DEFAULT_TABLE_LISTENING_PORT))
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
    
    return parameters.endsWith(",") ? parameters.substring(0, parameters.length - 1) : parameters;
  }
}