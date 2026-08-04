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
};

describe("AzuriteTelemetryClient", () => {
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
});
