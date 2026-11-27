import { gzip } from "zlib";
import { request } from "https";
import { randomBytes } from "crypto";
import {
  Attributes,
  context,
  SpanContext,
  trace
} from "@opentelemetry/api";

export interface EventTelemetry {
  name: string;
  properties?: Attributes;
}

export interface RequestTelemetry {
  name: string;
  url?: string;
  duration: number;
  resultCode: number | string;
  success: boolean;
  properties?: Attributes;
  id?: string;
}

interface TelemetryResource {
  attributes: Attributes;
}

interface TelemetryEnvelope {
  name: string;
  time: string;
  iKey: string;
  sampleRate?: number;
  tags: Attributes;
  data: {
    baseType: "EventData" | "RequestData";
    baseData: {
      ver: number;
      name: string;
      properties: Attributes;
      duration?: string;
      id?: string;
      responseCode?: string;
      success?: boolean;
      url?: string;
    };
  };
}

export default class AzureMonitorTelemetryClient {
  private readonly instrumentationKey: string;
  private readonly endpoint: URL;
  private readonly resource: Attributes;
  private readonly envelopes: TelemetryEnvelope[] = [];
  private flushTimer?: NodeJS.Timeout;

  public constructor(
    connectionString: string,
    resource: TelemetryResource,
    private readonly samplingPercentage: number
  ) {
    const settings = this.parseConnectionString(connectionString);
    this.instrumentationKey = settings["InstrumentationKey"];
    this.endpoint = new URL(
      "v2.1/track",
      settings["IngestionEndpoint"] ??
        "https://dc.services.visualstudio.com/"
    );
    this.resource = resource.attributes;
  }

  public trackEvent(telemetry: EventTelemetry): void {
    this.envelopes.push(
      this.createEnvelope("EventData", telemetry.name, telemetry.properties)
    );
    this.scheduleFlush();
  }

  public trackRequest(telemetry: RequestTelemetry): void {
    if (Math.random() * 100 >= this.samplingPercentage) {
      return;
    }

    const properties = { ...telemetry.properties };
    const sampleRate = Number(properties["microsoft.sample_rate"] ?? this.samplingPercentage);
    delete properties["microsoft.sample_rate"];
    const spanContext = trace.getSpanContext(context.active());
    const operation = this.getOperationContext(spanContext);
    const envelope = this.createEnvelope(
      "RequestData",
      telemetry.name,
      properties
    );
    envelope.data.baseData.duration = this.formatDuration(telemetry.duration);
    envelope.data.baseData.id = telemetry.id ?? operation.spanId;
    envelope.data.baseData.responseCode = `${telemetry.resultCode}`;
    envelope.data.baseData.success = telemetry.success;
    envelope.data.baseData.url = telemetry.url;
    envelope.tags["ai.operation.id"] = operation.traceId;
    if (spanContext) {
      envelope.tags["ai.operation.parentId"] = spanContext.spanId;
    }
    if (sampleRate < 100) {
      envelope.sampleRate = sampleRate;
    }
    this.envelopes.push(envelope);
    this.scheduleFlush();
  }

  public async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.envelopes.length === 0) {
      return;
    }

    const batch = this.envelopes.splice(0);
    try {
      await this.post(JSON.stringify(batch));
    } catch (error) {
      this.envelopes.unshift(...batch);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    await this.flush();
  }

  private scheduleFlush(): void {
    if (this.envelopes.length >= 64) {
      void this.flush().catch(error =>
        process.emitWarning(`Failed to send Azurite telemetry: ${error.message}`)
      );
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        void this.flush().catch(error =>
          process.emitWarning(
            `Failed to send Azurite telemetry: ${error.message}`
          )
        );
      }, 15_000);
      this.flushTimer.unref();
    }
  }

  private createEnvelope(
    baseType: "EventData" | "RequestData",
    name: string,
    properties: Attributes = {}
  ): TelemetryEnvelope {
    return {
      name: `Microsoft.ApplicationInsights.${baseType === "EventData" ? "Event" : "Request"}`,
      time: new Date().toISOString(),
      iKey: this.instrumentationKey,
      tags: {
        "ai.cloud.role": this.resource["service.name"],
        "ai.application.ver": this.resource["service.version"],
        "ai.cloud.roleInstance": this.resource["service.instance.id"]
      },
      data: {
        baseType,
        baseData: {
          ver: 2,
          name,
          properties
        }
      }
    };
  }

  private getOperationContext(spanContext?: SpanContext): {
    traceId: string;
    spanId: string;
  } {
    return {
      traceId: spanContext?.traceId ?? randomBytes(16).toString("hex"),
      spanId: randomBytes(8).toString("hex")
    };
  }

  private parseConnectionString(connectionString: string): Record<string, string> {
    return Object.fromEntries(
      connectionString
        .split(";")
        .map(component => component.split("=", 2))
        .filter(component => component.length === 2)
    );
  }

  private formatDuration(durationInMilliseconds: number): string {
    const milliseconds = Math.max(0, durationInMilliseconds);
    const hours = Math.floor(milliseconds / 3_600_000);
    const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
    const seconds = Math.floor((milliseconds % 60_000) / 1000);
    const fraction = (milliseconds % 1000).toFixed(0).padStart(3, "0");
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${fraction}`;
  }

  private async post(payload: string): Promise<void> {
    const body = await new Promise<Buffer>((resolve, reject) =>
      gzip(payload, (error, result) => (error ? reject(error) : resolve(result)))
    );

    await new Promise<void>((resolve, reject) => {
      const req = request(
        this.endpoint,
        {
          method: "POST",
          headers: {
            "content-encoding": "gzip",
            "content-length": body.length,
            "content-type": "application/json"
          }
        },
        res => {
          res.resume();
          res.on("end", () => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(
                new Error(
                  `Azure Monitor ingestion failed with status ${res.statusCode}`
                )
              );
            } else {
              resolve();
            }
          });
        }
      );
      req.on("error", reject);
      req.end(body);
    });
  }
}
