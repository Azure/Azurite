import { strict as assert } from "assert";
import { createHash } from "crypto";
import { AzuriteTelemetryClient } from "../../src/common/Telemetry";

interface TelemetryEnvelope {
  name: string;
  time: Date;
  tags?: { [propertyName: string]: string };
}

const telemetryProcessor = AzuriteTelemetryClient as unknown as {
  removeRoleInstance(envelope: TelemetryEnvelope): boolean;
  GetRequestUri(endpoint: string): string;
  GetContextID(context: {
    contextId?: string;
    contextID?: string;
  }): string | undefined;
  GetAllParameterString(): Promise<string>;
};

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

  it("redacts identifying telemetry tags", () => {
    const roleInstance = "host.example.com";
    const envelope: TelemetryEnvelope = {
      name: "request",
      time: new Date(),
      tags: {
        "ai.cloud.roleInstance": roleInstance,
        "ai.operation.name": "/devstoreaccount1/container/blob"
      }
    };

    assert.equal(telemetryProcessor.removeRoleInstance(envelope), true);
    assert.equal(
      envelope.tags!["ai.cloud.roleInstance"],
      createHash("sha256").update(roleInstance).digest("hex")
    );
    assert.equal(envelope.tags!["ai.operation.name"], "");
  });

  it("accepts telemetry envelopes without tags", () => {
    const envelope: TelemetryEnvelope = {
      name: "request",
      time: new Date()
    };

    assert.equal(telemetryProcessor.removeRoleInstance(envelope), true);
  });

  it("accepts telemetry envelopes without a role instance", () => {
    const envelope: TelemetryEnvelope = {
      name: "request",
      time: new Date(),
      tags: { "ai.operation.name": "/devstoreaccount1/container/blob" }
    };

    assert.equal(telemetryProcessor.removeRoleInstance(envelope), true);
    assert.equal(envelope.tags!["ai.operation.name"], "");
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
