import { strict as assert } from "assert";
import { AsyncLocalStorage } from "async_hooks";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import * as https from "https";
import { AddressInfo } from "net";
import { hostname } from "os";
import { join } from "path";
import { gunzipSync } from "zlib";
import {
  Context,
  ContextManager,
  context as otelContext,
  ROOT_CONTEXT,
  trace,
  TraceFlags
} from "@opentelemetry/api";
import type { TelemetryClient } from "applicationinsights";
import { VERSION } from "../../src/blob/utils/constants";
import { AzuriteTelemetryClient } from "../../src/common/Telemetry";

interface TelemetryEnvelope {
  name: string;
  sampleRate?: number;
  tags?: { [propertyName: string]: string };
  data?: {
    baseType?: string;
    baseData?: {
      name?: string;
      properties?: { [propertyName: string]: string };
      metrics?: { name: string }[];
    };
  };
}

const telemetryProcessor = AzuriteTelemetryClient as unknown as {
  createAppInsightsClient(
    samplingPercentage: number,
    connectionString?: string
  ): TelemetryClient;
  createResource(): { attributes: { [key: string]: unknown } };
  GetRequestAuthentication(
    authorizationHeader: string | undefined,
    sigQuery: string | undefined
  ): string;
  GetRequestUri(endpoint: string): string;
  GetContextID(context: {
    contextId?: string;
    contextID?: string;
  }): string | undefined;
  GetAllParameterString(): Promise<string>;
};

// The Azure Monitor exporter always uses HTTPS. Like the other HTTPS tests, this relies on
// NODE_TLS_REJECT_UNAUTHORIZED=0 from the test scripts to accept the test certificate.
async function captureTelemetry(
  send: (client: TelemetryClient) => void,
  samplingPercentage: number = 100
): Promise<TelemetryEnvelope[]> {
  const envelopes: TelemetryEnvelope[] = [];
  const server = https.createServer(
    {
      cert: readFileSync(join(__dirname, "..", "server.cert")),
      key: readFileSync(join(__dirname, "..", "server.key"))
    },
    (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        let body = Buffer.concat(chunks);
        if ((req.headers["content-encoding"] ?? "").includes("gzip")) {
          body = gunzipSync(body);
        }
        const items: TelemetryEnvelope[] = body.length
          ? [].concat(JSON.parse(body.toString("utf8")))
          : [];
        envelopes.push(...items);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            itemsReceived: items.length,
            itemsAccepted: items.length,
            errors: []
          })
        );
      });
    }
  );
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve)
  );

  const { port } = server.address() as AddressInfo;
  const client = telemetryProcessor.createAppInsightsClient(
    samplingPercentage,
    `InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://127.0.0.1:${port}/`
  );
  try {
    send(client);
    await client.flush();
  } finally {
    await client.shutdown();
    await new Promise((resolve) => server.close(resolve));
  }
  return envelopes;
}

// Stands in for a context manager registered by other OpenTelemetry instrumentation in the process.
class TestContextManager implements ContextManager {
  private readonly storage = new AsyncLocalStorage<Context>();

  public active(): Context {
    return this.storage.getStore() ?? ROOT_CONTEXT;
  }

  public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.storage.run(context, () => fn.call(thisArg, ...args));
  }

  public bind<T>(_context: Context, target: T): T {
    return target;
  }

  public enable(): this {
    return this;
  }

  public disable(): this {
    this.storage.disable();
    return this;
  }
}

describe("AzuriteTelemetryClient", () => {
  const originalArgv = process.argv;
  const originalSkipApiVersionCheck =
    process.env.AZURITE_SKIP_API_VERSION_CHECK;
  const originalIsVSC = AzuriteTelemetryClient.isVSC;

  afterEach(() => {
    process.argv = originalArgv;
    AzuriteTelemetryClient.isVSC = originalIsVSC;
    if (originalSkipApiVersionCheck === undefined) {
      delete process.env.AZURITE_SKIP_API_VERSION_CHECK;
    } else {
      process.env.AZURITE_SKIP_API_VERSION_CHECK = originalSkipApiVersionCheck;
    }
  });

  it("identifies telemetry as Azurite without the raw machine name", () => {
    const attributes = telemetryProcessor.createResource().attributes;

    assert.deepEqual(attributes, {
      "service.name": "Azurite_V1.0",
      "service.version": VERSION,
      "service.instance.id": createHash("sha256")
        .update(hostname())
        .digest("hex")
    });
  });

  it("sends Azurite role, version, and sample rate through the Application Insights SDK", async () => {
    const envelopes = await captureTelemetry((client) => {
      client.trackEvent({
        name: "Azurite Start",
        properties: { instanceID: "instance" }
      });
      client.trackRequest({
        name: "B_BlockBlob_Upload",
        url: "",
        duration: 1,
        resultCode: "201",
        success: true,
        properties: {
          apiVersion: "v2026-06-06",
          "microsoft.sample_rate": 1
        } as { [key: string]: any }
      });
    });

    const event = envelopes.find((e) => e.data?.baseType === "EventData");
    const request = envelopes.find((e) => e.data?.baseType === "RequestData");
    assert.ok(event, "event envelope was not sent");
    assert.ok(request, "request envelope was not sent");

    const expectedRoleInstance = createHash("sha256")
      .update(hostname())
      .digest("hex");
    for (const envelope of [event!, request!]) {
      assert.equal(envelope.tags!["ai.cloud.role"], "Azurite_V1.0");
      assert.equal(envelope.tags!["ai.application.ver"], VERSION);
      assert.equal(
        envelope.tags!["ai.cloud.roleInstance"],
        expectedRoleInstance
      );
      assert.equal(
        envelope.data!.baseData!.properties!["ai.cloud.role"],
        undefined
      );
    }

    assert.equal(request!.data!.baseData!.name, "B_BlockBlob_Upload");
    assert.equal(request!.sampleRate, 1);
    assert.deepEqual(Object.keys(request!.data!.baseData!.properties!), [
      "apiVersion"
    ]);

    const serialized = JSON.stringify(envelopes);
    assert.equal(serialized.includes(`"${hostname()}"`), false);
    assert.equal(serialized.includes("_OTELRESOURCE_"), false);
    assert.equal(
      process.env.APPLICATIONINSIGHTS_OPENTELEMETRY_RESOURCE_METRIC_DISABLED,
      undefined
    );
  });

  it("samples requests at 1% even inside another library's sampled span", async () => {
    const telemetryState = AzuriteTelemetryClient as unknown as {
      enableTelemetry: boolean;
      requestClient: TelemetryClient | undefined;
    };
    const originalEnableTelemetry = telemetryState.enableTelemetry;
    const originalRequestClient = telemetryState.requestClient;
    const sampledParent = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: TraceFlags.SAMPLED
    });
    const requestCount = 200;

    otelContext.setGlobalContextManager(new TestContextManager());
    let envelopes: TelemetryEnvelope[];
    try {
      envelopes = await captureTelemetry((client) => {
        telemetryState.enableTelemetry = true;
        telemetryState.requestClient = client;
        otelContext.with(sampledParent, () => {
          for (let i = 0; i < requestCount; i++) {
            AzuriteTelemetryClient.TraceRequest({});
          }
        });
      }, 1);
    } finally {
      otelContext.disable();
      telemetryState.enableTelemetry = originalEnableTelemetry;
      telemetryState.requestClient = originalRequestClient;
    }

    const requests = envelopes.filter(
      (e) => e.data?.baseType === "RequestData"
    );
    // 1% of 200 is 2; without isolation from the parent span all 200 are sent.
    assert.ok(
      requests.length < 20,
      `expected about 1% of ${requestCount} requests, got ${requests.length}`
    );
  });

  it("reports only known authorization schemes", () => {
    const auth = telemetryProcessor.GetRequestAuthentication;

    assert.equal(auth("SharedKey devstoreaccount1:signature", undefined), "SharedKey");
    assert.equal(auth("sharedkeylite devstoreaccount1:signature", undefined), "SharedKeyLite");
    assert.equal(auth("Bearer token", undefined), "Bearer");
    assert.equal(auth("SharedKey devstoreaccount1:signature", "sig"), "SharedKey,Sas");
    assert.equal(auth("malformed-token-without-a-scheme", undefined), "Other");
    assert.equal(auth(undefined, "sig"), "Sas");
    assert.equal(auth("", undefined), "Anonymous");
    assert.equal(auth(undefined, undefined), "Anonymous");
  });

  it("redacts known local hosts from request URIs", () => {
    assert.equal(
      telemetryProcessor.GetRequestUri("http://localhost:10000/account"),
      "http://[hidden]:10000/account"
    );
    assert.equal(
      telemetryProcessor.GetRequestUri("http://127.0.0.1:10000/account"),
      "http://[hidden]:10000/account"
    );
    assert.equal(
      telemetryProcessor.GetRequestUri(
        "http://host.docker.internal:10000/account"
      ),
      "http://[hidden]:10000/account"
    );
  });

  it("keeps request URIs for unknown hosts", () => {
    const endpoint = "https://storage.example.com/account";

    assert.equal(telemetryProcessor.GetRequestUri(endpoint), endpoint);
  });

  it("reads request IDs from Blob, Queue, and Table contexts", () => {
    assert.equal(
      telemetryProcessor.GetContextID({ contextId: "blob-request" }),
      "blob-request"
    );
    assert.equal(
      telemetryProcessor.GetContextID({ contextID: "queue-table-request" }),
      "queue-table-request"
    );
  });

  it("records env-var activation without recording its value", async () => {
    process.argv = ["node", "azurite"];
    process.env.AZURITE_SKIP_API_VERSION_CHECK = "true";
    AzuriteTelemetryClient.isVSC = false;

    const parameters = await telemetryProcessor.GetAllParameterString();
    const parameterNames = parameters.split(",");

    assert.equal(parameterNames.includes("skipApiVersionCheck"), true);
    assert.equal(parameters.includes("true"), false);
  });

  it("records skipApiVersionCheck once when enabled by CLI and env var", async () => {
    process.argv = ["node", "azurite", "--skipApiVersionCheck"];
    process.env.AZURITE_SKIP_API_VERSION_CHECK = "true";
    AzuriteTelemetryClient.isVSC = false;

    const parameters = await telemetryProcessor.GetAllParameterString();

    assert.equal(
      parameters.split(",").filter((value) => value === "skipApiVersionCheck")
        .length,
      1
    );
  });
});
