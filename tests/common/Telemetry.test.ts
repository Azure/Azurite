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
});
