import type { TelemetryClient } from "applicationinsights";
import { context as otelContext, ROOT_CONTEXT } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { default as BlobContext } from "../blob/generated/Context";
import { default as QueueContext } from "../queue/generated/Context";
import { default as TableContext } from "../table/generated/Context";
import { Operation as BlobOperation } from "../blob/generated/artifacts/operation";
import { Operation as QueueOperation } from "../queue/generated/artifacts/operation";
import { Operation as TableOperation } from "../table/generated/artifacts/operation";
import { createHash } from "crypto";
import * as fs from "fs";
import { hostname } from "os";
import { randomUUID as uuid } from "crypto";
import { join } from "path";
import logger from "./Logger";
import {
  DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
  DEFAULT_BLOB_LISTENING_PORT,
  DEFAULT_BLOB_SERVER_HOST_NAME,
  VERSION
} from "../blob/utils/constants";
import { DEFAULT_QUEUE_LISTENING_PORT } from "../queue/utils/constants";
import { DEFAULT_TABLE_LISTENING_PORT } from "../table/utils/constants";
import { shouldSkipApiVersionCheck } from "./utils/environment";

const TELEMETRY_CONNECTION_STRING =
  "InstrumentationKey=feb4ae36-1db7-4808-abaa-e0b94996d665;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/;ApplicationId=9af871a3-75b5-417c-8a2f-7f2eb1ba6a6c";

// Read by the Azure Monitor exporter when it is constructed. When unset, every exported batch
// also carries an "_OTELRESOURCE_" metric that duplicates the resource attributes.
const RESOURCE_METRIC_DISABLED_ENV =
  "APPLICATIONINSIGHTS_OPENTELEMETRY_RESOURCE_METRIC_DISABLED";

// Azure Monitor reads this span attribute as the envelope sample rate, so Application Insights
// keeps reporting itemCount as the estimated number of requests rather than the sampled count.
const SAMPLE_RATE_ATTRIBUTE = "microsoft.sample_rate";

const KNOWN_AUTHORIZATION_SCHEMES = ["SharedKey", "SharedKeyLite", "Bearer"];

export class AzuriteTelemetryClient {
  private static eventClient: TelemetryClient | undefined;
  private static requestClient: TelemetryClient | undefined;

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
  private static isDebug = false; // false in production, true in development
  private static requestCollectPercentage = AzuriteTelemetryClient.isDebug
    ? 100
    : 1;
  private static enableAppInsightLog = AzuriteTelemetryClient.isDebug
    ? true
    : false;
  private static cloudRole = AzuriteTelemetryClient.isDebug
    ? "AzuriteTest"
    : "Azurite_V1.0";

  private static appInsights = require("applicationinsights");

  public static init(
    location: string,
    enableTelemetry: boolean,
    env: any,
    isVSC: boolean = false
  ) {
    try {
      AzuriteTelemetryClient.enableTelemetry = enableTelemetry;

      if (
        enableTelemetry !== false &&
        AzuriteTelemetryClient.initialized != true
      ) {
        AzuriteTelemetryClient.isVSC = isVSC;
        AzuriteTelemetryClient.location = location;
        AzuriteTelemetryClient.instanceID =
          AzuriteTelemetryClient.GetInstanceID(
            typeof env?.inMemoryPersistence === "function" &&
              env?.inMemoryPersistence()
          );
        logger.info(
          `InstanceID ${AzuriteTelemetryClient.instanceID}, SessionID ${AzuriteTelemetryClient.sessionID}.`
        );

        AzuriteTelemetryClient.enableTelemetry = enableTelemetry;
        AzuriteTelemetryClient.env = env;
        if (
          AzuriteTelemetryClient.enableTelemetry &&
          AzuriteTelemetryClient.eventClient === undefined
        ) {
          // for start/stop event, will collect 100%
          this.eventClient = AzuriteTelemetryClient.createAppInsightsClient(100);
        }
        if (
          AzuriteTelemetryClient.enableTelemetry &&
          AzuriteTelemetryClient.requestClient === undefined
        ) {
          this.requestClient = AzuriteTelemetryClient.createAppInsightsClient(
            AzuriteTelemetryClient.requestCollectPercentage
          );
        }

        AzuriteTelemetryClient.initialized = true;
        logger.info("Telemetry initialize successfully.");
      } else {
        logger.info(
          "Don't need initialize Telemetry. enableTelemetry: " +
            enableTelemetry +
            ", initialized: " +
            AzuriteTelemetryClient.initialized
        );
      }
    } catch (e) {
      logger.warn("Fail to init telemetry, error: " + e.message);
    }
  }

  /**
   * Creates a client with its own OpenTelemetry providers. Unlike the global setup used by
   * applicationinsights.setup()/start(), isolated providers don't register global OpenTelemetry
   * state, auto-instrumentation, live metrics, or host/OS resource detection in the Azurite
   * (or VS Code extension host) process, and each client keeps its own sampling percentage.
   */
  private static createAppInsightsClient(
    samplingPercentage: number,
    connectionString: string = TELEMETRY_CONNECTION_STRING
  ): TelemetryClient {
    const telemetryClient: TelemetryClient =
      new AzuriteTelemetryClient.appInsights.TelemetryClient(connectionString, {
        useGlobalProviders: false
      });

    telemetryClient.config.samplingPercentage = samplingPercentage;
    telemetryClient.config.azureMonitorOpenTelemetryOptions = {
      resource: AzuriteTelemetryClient.createResource()
    };

    // Enable AppInsight log, should enable in development only
    if (AzuriteTelemetryClient.enableAppInsightLog) {
      telemetryClient.config.enableInternalDebugLogging = true;
      telemetryClient.config.enableInternalWarningLogging = true;
    }

    // Initialize now, so the exporters read the resource metric opt-out while it is set.
    AzuriteTelemetryClient.withEnvironmentVariable(
      RESOURCE_METRIC_DISABLED_ENV,
      "true",
      () => telemetryClient.initialize()
    );

    return telemetryClient;
  }

  /**
   * Sets cloud_RoleName, application_Version and cloud_RoleInstance in Application Insights.
   */
  private static createResource() {
    return resourceFromAttributes({
      "service.name": AzuriteTelemetryClient.cloudRole,
      "service.version": VERSION,
      // per privacy review, will not collect the machine name, only its hash
      "service.instance.id": createHash("sha256")
        .update(hostname())
        .digest("hex")
    });
  }

  private static withEnvironmentVariable(
    name: string,
    value: string,
    action: () => void
  ): void {
    const previousValue = process.env[name];
    process.env[name] = value;
    try {
      action();
    } finally {
      if (previousValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previousValue;
      }
    }
  }

  private static flush(): void {
    for (const client of [
      AzuriteTelemetryClient.eventClient,
      AzuriteTelemetryClient.requestClient
    ]) {
      client?.flush().catch((e: Error) => {
        logger.warn("Fail to flush telemetry, error: " + e.message);
      });
    }
  }

  public static TraceRequest(context: any) {
    let serviceType = "";
    let totalReqs = 0;
    let reqName = "";
    try {
      if (
        AzuriteTelemetryClient.enableTelemetry &&
        AzuriteTelemetryClient.requestClient !== undefined
      ) {
        if (context instanceof BlobContext) {
          serviceType = "Blob";
          AzuriteTelemetryClient._totalBlobRequestCount++;
          totalReqs = AzuriteTelemetryClient._totalBlobRequestCount;
          reqName = "B_" + BlobOperation[context.operation ?? 0];
        } else if (context instanceof QueueContext) {
          serviceType = "Queue";
          AzuriteTelemetryClient._totalQueueRequestCount++;
          totalReqs = AzuriteTelemetryClient._totalQueueRequestCount;
          reqName = "Q_" + QueueOperation[context.operation ?? 0];
        } else if (context instanceof TableContext) {
          serviceType = "Table";
          AzuriteTelemetryClient._totalTableRequestCount++;
          totalReqs = AzuriteTelemetryClient._totalTableRequestCount;
          reqName = "T_" + TableOperation[context.operation ?? 0];
        }
        let requestProperties: { [key: string]: any } = {
          apiVersion: "v" + context.request?.getHeader("x-ms-version"),
          authorization:
            context.request !== undefined
              ? AzuriteTelemetryClient.GetRequestAuthentication(
                  context.request.getHeader("authorization"),
                  context.request.getQuery("sig")
                )
              : "",
          instanceID: AzuriteTelemetryClient.instanceID,
          sessionID: AzuriteTelemetryClient.sessionID,
          ReqNo: totalReqs
        };

        const ingress = context.request?.getHeader("content-length");
        if (ingress !== undefined) {
          if (ingress && parseInt(ingress)) {
            requestProperties["ingress"] = ingress;
            this._totalIngressSize += parseInt(ingress);
          }
        }

        // When body is XML or JSON, the "content-length" header isn't returned even when it has a body, so it can't currently be calculated into egress telemetry.
        // HEAD requests don't have bodies but can have a "content-length" header. For example, GetBlobProperties uses it for the blob length, not the body length.
        if (context.request?.getMethod() !== "HEAD") {
          const egress = context.response?.getHeader("content-length");
          if (egress !== undefined) {
            if (egress && parseInt(egress)) {
              requestProperties["egress"] = egress;
              this._totalEgressSize += parseInt(egress);
            }
          }
        }

        const requestTelemetry = {
          name: reqName,
          url:
            context.request !== undefined
              ? AzuriteTelemetryClient.GetRequestUri(
                  context.request.getEndpoint()
                )
              : "",
          duration: context.startTime
            ? new Date().getTime() - context.startTime?.getTime()
            : 0,
          resultCode: context.response?.getStatusCode() ?? 0,
          success: (context.response?.getStatusCode() ?? 500) <= 399,
          id: AzuriteTelemetryClient.GetContextID(context), // Request ID
          properties: {
            ...requestProperties,
            source: context.request?.getHeader("user-agent"),
            [SAMPLE_RATE_ATTRIBUTE]:
              AzuriteTelemetryClient.requestCollectPercentage
          }
        };
        const requestClient = AzuriteTelemetryClient.requestClient;
        // Start from the root context, so a span from other OpenTelemetry instrumentation in the
        // process (e.g. another VS Code extension) can't become the parent and bypass sampling.
        otelContext.with(ROOT_CONTEXT, () =>
          requestClient.trackRequest(requestTelemetry)
        );

        logger.verbose(
          `Send ${serviceType} telemetry: ` + reqName,
          AzuriteTelemetryClient.GetContextID(context)
        );
      }
    } catch (e) {
      logger.warn(
        `Fail to telemetry a ${serviceType} request, error: ` + e.message
      );
    }
  }

  public static async TraceStartEvent(serviceType: string = "") {
    try {
      if (
        AzuriteTelemetryClient.enableTelemetry &&
        AzuriteTelemetryClient.eventClient !== undefined
      ) {
        AzuriteTelemetryClient.eventClient.trackEvent({
          name:
            "Azurite Start" + (serviceType === "" ? "" : ": " + serviceType),
          properties: {
            instanceID: AzuriteTelemetryClient.instanceID,
            sessionID: AzuriteTelemetryClient.sessionID,
            parameters: await AzuriteTelemetryClient.GetAllParameterString()
          }
        });
        logger.verbose("Send start telemetry");
      }
    } catch (e) {
      logger.warn("Fail to send start telemetry, error: " + e.message);
    }
  }

  public static TraceStopEvent(serviceType: string = "") {
    try {
      if (
        AzuriteTelemetryClient.enableTelemetry &&
        AzuriteTelemetryClient.eventClient !== undefined
      ) {
        AzuriteTelemetryClient.eventClient.trackEvent({
          name: "Azurite Stop" + (serviceType === "" ? "" : ": " + serviceType),
          properties: {
            instanceID: AzuriteTelemetryClient.instanceID,
            sessionID: AzuriteTelemetryClient.sessionID,
            blobRequest: AzuriteTelemetryClient._totalBlobRequestCount,
            queueRequest: AzuriteTelemetryClient._totalQueueRequestCount,
            tableRequest: AzuriteTelemetryClient._totalTableRequestCount,
            totalIngress: AzuriteTelemetryClient._totalIngressSize,
            totalEgress: AzuriteTelemetryClient._totalEgressSize
          }
        });
        // Telemetry is batched, so send it now instead of losing it when the process exits.
        AzuriteTelemetryClient.flush();
        logger.verbose("Send stop telemetry");
      }
    } catch (e) {
      logger.warn("Fail to send stop telemetry, error: " + e.message);
    }
  }

  private static GetRequestUri(endpoint: string): string {
    //From privacy review, won't return the whole Uri
    let uri = new URL(endpoint);
    let knownHosts = ["127.0.0.1", "localhost", "host.docker.internal"];
    if (knownHosts.includes(uri.hostname.toLowerCase())) {
      return endpoint.replace(uri.hostname, "[hidden]");
    } else {
      return endpoint;
    }
  }

  private static GetContextID(context: {
    contextId?: string;
    contextID?: string;
  }): string | undefined {
    return context.contextId ?? context.contextID;
  }

  private static GetInstanceID(inMemoryPersistence: boolean = false): string {
    const configFilePath = join(
      AzuriteTelemetryClient.location,
      AzuriteTelemetryClient.configFileName
    );

    let instanceID = "";
    if (inMemoryPersistence) {
      return uuid();
    }
    try {
      if (!fs.existsSync(configFilePath)) {
        instanceID = uuid();
        fs.writeFileSync(configFilePath, `{"instanceID":"${instanceID}"}`);
      } else {
        try {
          let data = fs.readFileSync(configFilePath, "utf8");
          instanceID = JSON.parse(data.toString()).instanceID;
        } catch (e) {
          logger.warn(
            `Failed to read instanceID from file ${configFilePath} and will regenerate instanceID, error: ` +
              e.message
          );
        }
        if (instanceID === undefined || instanceID === "") {
          instanceID = uuid();
          fs.writeFileSync(configFilePath, `{"instanceID":"${instanceID}"}`);
        }
      }
      return instanceID;
    } catch (e) {
      logger.warn(
        `Failed to read or generate/save instanceID, will use instanceID "${instanceID}", error: ` +
          e.message
      );
      return instanceID;
    }
  }

  private static GetRequestAuthentication(
    authorizationHeader: string | undefined,
    sigQuery: string | undefined
  ): string {
    // Only report known scheme names, so a malformed header can't put a credential into telemetry.
    const scheme = authorizationHeader?.trim().split(" ")[0];
    let auth = scheme
      ? KNOWN_AUTHORIZATION_SCHEMES.find(
          (knownScheme) => knownScheme.toLowerCase() === scheme.toLowerCase()
        ) ?? "Other"
      : undefined;
    if (auth !== undefined) {
      if (sigQuery !== undefined) {
        auth = auth + ",Sas";
      }
      //else auth in head is already retrived, no need to add more
    } else // no auth header
    {
      if (sigQuery !== undefined) {
        auth = "Sas";
      } else {
        auth = "Anonymous";
      }
    }
    return auth;
  }

  private static async GetAllParameterString(): Promise<string> {
    let parameters = "";
    if (process.env.AZURITE_ACCOUNTS) {
      parameters += "AZURITE_ACCOUNTS,";
    }
    if (process.env.AZURITE_DB) {
      parameters += "AZURITE_DB,";
    }
    let longParameters = [
      "blobHost",
      "queueHost",
      "tableHost",
      "blobPort",
      "queuePort",
      "tablePort",
      "blobKeepAliveTimeout",
      "queueKeepAliveTimeout",
      "tableKeepAliveTimeout",
      "location",
      "cert",
      "key",
      "pwd",
      "oauth",
      "extentMemoryLimit",
      "debug",
      "silent",
      "loose",
      "skipApiVersionCheck",
      "disableProductStyleUrl",
      "inMemoryPersistence",
      "disableTelemetry"
    ];
    let shortParameters: { [string: string]: any } = {
      d: "debug",
      l: "location",
      L: "loose",
      s: "silent"
    };

    if (AzuriteTelemetryClient.isVSC) // VSC
    {
      if (AzuriteTelemetryClient.env === undefined) {
        return parameters;
      }
      let workspaceConfiguration = AzuriteTelemetryClient.env;
      if (workspaceConfiguration === undefined) {
        return parameters;
      } else {
        longParameters.forEach((flag) => {
          let value = workspaceConfiguration.get(flag);
          if (
            value !== undefined &&
            value !== "" &&
            value !== false &&
            value !== null &&
            !(
              flag.endsWith("Host") && value === DEFAULT_BLOB_SERVER_HOST_NAME
            ) &&
            !(
              flag.endsWith("KeepAliveTimeout") &&
              value === DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT
            ) &&
            !(flag == "blobPort" && value === DEFAULT_BLOB_LISTENING_PORT) &&
            !(flag == "queuePort" && value === DEFAULT_QUEUE_LISTENING_PORT) &&
            !(flag == "tablePort" && value === DEFAULT_TABLE_LISTENING_PORT)
          ) {
            parameters += flag + ",";
          }
        });
      }
    } else // npm (exe, docker)
    {
      if (
        shouldSkipApiVersionCheck() &&
        !process.argv.some(
          (value) => value.toLowerCase() === "--skipapiversioncheck"
        )
      ) {
        parameters += "skipApiVersionCheck,";
      }
      process.argv.forEach((val, index) => {
        if (val.startsWith("--")) {
          longParameters.forEach((flag) => {
            if (val.toLowerCase() === `--${flag}`.toLowerCase()) {
              parameters += flag + ",";
            }
          });
        } else if (val.startsWith("-")) {
          if (shortParameters[val.substring(1)] !== undefined) {
            parameters += shortParameters[val.substring(1)] + ",";
          }
        }
      });
    }

    return parameters.endsWith(",")
      ? parameters.substring(0, parameters.length - 1)
      : parameters;
  }
}
