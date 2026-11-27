import { randomBytes } from "crypto";
import { request } from "https";
import { gzip } from "zlib";
import { Attributes, SpanContext } from "@opentelemetry/api";

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
  spanContext?: SpanContext;
}

export interface TelemetryResource {
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

interface QueuedEnvelope {
  envelope: TelemetryEnvelope;
  attempts: number;
}

interface IngestionResponse {
  errors?: Array<{
    index: number;
    statusCode: number;
    message?: string;
  }>;
}

class IngestionError extends Error {
  public constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
  }
}

const MAX_QUEUE_LENGTH = 4096;
const MAX_BATCH_LENGTH = 64;
const MAX_RETRY_ATTEMPTS = 3;
const FLUSH_INTERVAL_MILLISECONDS = 15_000;
const RETRY_DELAY_MILLISECONDS = 1_000;
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;

export default class AzureMonitorTelemetryClient {
  private readonly instrumentationKey: string;
  private readonly endpoint: URL;
  private readonly resource: Attributes;
  private readonly envelopes: QueuedEnvelope[] = [];
  private flushTimer?: NodeJS.Timeout;
  private flushPromise?: Promise<void>;

  public constructor(
    connectionString: string,
    resource: TelemetryResource,
    private readonly samplingPercentage: number,
    private readonly requestTimeoutMilliseconds = REQUEST_TIMEOUT_MILLISECONDS
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
    this.enqueue(
      this.createEnvelope("EventData", telemetry.name, telemetry.properties)
    );
  }

  public trackRequest(telemetry: RequestTelemetry): void {
    if (Math.random() * 100 >= this.samplingPercentage) {
      return;
    }

    const properties = { ...telemetry.properties };
    const sampleRate = Number(
      properties["microsoft.sample_rate"] ?? this.samplingPercentage
    );
    delete properties["microsoft.sample_rate"];
    const operation = this.getOperationContext(telemetry.spanContext);
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
    if (telemetry.spanContext) {
      envelope.tags["ai.operation.parentId"] = telemetry.spanContext.spanId;
    }
    if (sampleRate < 100) {
      envelope.sampleRate = sampleRate;
    }
    this.enqueue(envelope);
  }

  public async flush(): Promise<void> {
    this.clearFlushTimer();
    if (this.flushPromise) {
      return this.flushPromise;
    }
    if (this.envelopes.length === 0) {
      return;
    }

    this.flushPromise = this.exportBatches().finally(() => {
      this.flushPromise = undefined;
      if (this.envelopes.length > 0 && !this.flushTimer) {
        this.scheduleFlush(RETRY_DELAY_MILLISECONDS);
      }
    });
    return this.flushPromise;
  }

  public async shutdown(): Promise<void> {
    await this.flush();
  }

  private async exportBatches(): Promise<void> {
    while (this.envelopes.length > 0) {
      const batch = this.envelopes.splice(0, MAX_BATCH_LENGTH);
      try {
        const response = await this.post(
          JSON.stringify(batch.map(item => item.envelope))
        );
        if (this.requeueRejectedItems(batch, response.errors ?? []) > 0) {
          return;
        }
      } catch (error) {
        this.requeueFailedBatch(batch, error);
        throw error;
      }
    }
  }

  private enqueue(envelope: TelemetryEnvelope): void {
    if (this.envelopes.length >= MAX_QUEUE_LENGTH) {
      this.envelopes.shift();
      process.emitWarning(
        "Azurite telemetry queue is full; dropping the oldest envelope"
      );
    }
    this.envelopes.push({ envelope, attempts: 0 });
    this.scheduleFlush();
  }

  private scheduleFlush(delay = FLUSH_INTERVAL_MILLISECONDS): void {
    if (this.envelopes.length >= MAX_BATCH_LENGTH && !this.flushPromise) {
      void this.flush().catch(error =>
        process.emitWarning(`Failed to send Azurite telemetry: ${error.message}`)
      );
    } else if (!this.flushTimer && !this.flushPromise) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        void this.flush().catch(error =>
          process.emitWarning(
            `Failed to send Azurite telemetry: ${error.message}`
          )
        );
      }, delay);
      this.flushTimer.unref();
    }
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private requeueRejectedItems(
    batch: QueuedEnvelope[],
    errors: NonNullable<IngestionResponse["errors"]>
  ): number {
    let requeued = 0;
    for (const error of errors) {
      const item = batch[error.index];
      if (
        item &&
        this.isRetryableStatus(error.statusCode) &&
        item.attempts < MAX_RETRY_ATTEMPTS
      ) {
        item.attempts++;
        this.requeue(item);
        requeued++;
      }
    }
    return requeued;
  }

  private requeueFailedBatch(batch: QueuedEnvelope[], error: unknown): void {
    if (!(error instanceof IngestionError) || this.isRetryableStatus(error.statusCode)) {
      for (const item of batch) {
        if (item.attempts < MAX_RETRY_ATTEMPTS) {
          item.attempts++;
          this.requeue(item);
        }
      }
    }
  }

  private requeue(item: QueuedEnvelope): void {
    if (this.envelopes.length >= MAX_QUEUE_LENGTH) {
      this.envelopes.shift();
      process.emitWarning(
        "Azurite telemetry queue is full; dropping the oldest envelope"
      );
    }
    this.envelopes.push(item);
  }

  private isRetryableStatus(statusCode?: number): boolean {
    return (
      statusCode === undefined ||
      statusCode === 408 ||
      statusCode === 429 ||
      (statusCode >= 500)
    );
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

  private async post(payload: string): Promise<IngestionResponse> {
    const body = await new Promise<Buffer>((resolve, reject) =>
      gzip(payload, (error, result) => (error ? reject(error) : resolve(result)))
    );

    return new Promise<IngestionResponse>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
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
          const chunks: Buffer[] = [];
          res.on("data", chunk => chunks.push(chunk));
          res.on("end", () => {
            if (timer) clearTimeout(timer);
            const statusCode = res.statusCode;
            if (!statusCode || statusCode < 200 || statusCode >= 300) {
              reject(
                new IngestionError(
                  `Azure Monitor ingestion failed with status ${statusCode}`,
                  statusCode
                )
              );
              return;
            }
            try {
              const response = Buffer.concat(chunks).toString();
              resolve(response ? JSON.parse(response) : {});
            } catch (error) {
              reject(error);
            }
          });
          res.on("error", error => {
            if (timer) clearTimeout(timer);
            reject(error);
          });
        }
      );
      timer = setTimeout(() => {
        req.destroy(new IngestionError("Azure Monitor ingestion timed out"));
      }, this.requestTimeoutMilliseconds);
      req.on("error", error => {
        if (timer) clearTimeout(timer);
        reject(error);
      });
      req.on("close", () => {
        if (timer) clearTimeout(timer);
      });
      req.end(body);
    });
  }
}
