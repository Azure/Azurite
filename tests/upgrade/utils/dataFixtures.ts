export interface BlobFixture {
  name: string;
  contentType: string;
  content: Buffer;
  /** Which blob type to exercise when uploading this fixture. */
  blobType: "block" | "append" | "page";
}

/**
 * Deterministic (not random) binary content so runs are reproducible and
 * diff-friendly across CI machines.
 */
function buildBinaryContent(sizeInBytes: number): Buffer {
  const buffer = Buffer.alloc(sizeInBytes);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = (i * 31 + 7) % 256;
  }
  return buffer;
}

/**
 * Representative blob content across the formats called out explicitly in
 * the regression requirements: txt, json, csv, xml and binary - each mapped
 * to a blob type so block/append/page blob persistence is all exercised.
 */
export function buildBlobFixtures(): BlobFixture[] {
  const jsonContent = JSON.stringify(
    {
      id: 1,
      name: "azurite",
      nested: { values: [1, 2, 3], enabled: true },
      unicode: "caf\u00e9 \u2603"
    },
    null,
    2
  );
  const csvContent = "id,name,value\n1,alpha,10.5\n2,beta,-3\n3,gamma,0\n";
  const xmlContent =
    '<?xml version="1.0" encoding="utf-8"?><root><item id="1">hello</item><item id="2">world</item></root>';
  const txtContent =
    "The quick brown fox jumps over the lazy dog.\n" +
    "Line two with unicode: \u00e9\u00e8\u00ea caf\u00e9 \u2603\n";

  return [
    {
      name: "sample.txt",
      contentType: "text/plain",
      content: Buffer.from(txtContent, "utf8"),
      blobType: "block"
    },
    {
      name: "sample.json",
      contentType: "application/json",
      content: Buffer.from(jsonContent, "utf8"),
      blobType: "block"
    },
    {
      name: "sample.csv",
      contentType: "text/csv",
      content: Buffer.from(csvContent, "utf8"),
      blobType: "block"
    },
    {
      name: "sample.xml",
      contentType: "application/xml",
      content: Buffer.from(xmlContent, "utf8"),
      blobType: "block"
    },
    {
      name: "sample.bin",
      contentType: "application/octet-stream",
      content: buildBinaryContent(256 * 1024),
      blobType: "block"
    },
    {
      name: "sample-append.bin",
      contentType: "application/octet-stream",
      content: buildBinaryContent(64 * 1024),
      blobType: "append"
    },
    {
      // Page blobs require 512-byte-aligned content.
      name: "sample-page.bin",
      contentType: "application/octet-stream",
      content: buildBinaryContent(512 * 4),
      blobType: "page"
    }
  ];
}

export interface QueueMessageFixture {
  queueName: string;
  messages: string[];
}

export function buildQueueFixtures(uniqueSuffix: string): QueueMessageFixture {
  return {
    queueName: `upgradequeue${uniqueSuffix}`,
    messages: [
      "plain text message",
      JSON.stringify({ event: "upgrade-test", ok: true, count: 3 }),
      Buffer.from("binary-ish payload \u00e9\u00e8\u00ea").toString("base64"),
      "message with special chars: <>&\"' and \\n escaped-newline"
    ]
  };
}

export interface TableEntityFixture {
  partitionKey: string;
  rowKey: string;
  stringProp: string;
  int32Prop: number;
  int64Prop: string; // Int64 is transported as string by @azure/data-tables
  doubleProp: number;
  boolProp: boolean;
  dateProp: Date;
  guidProp: string;
  binaryProp: Uint8Array;
}

export function buildTableEntityFixtures(
  tableName: string,
  uniqueSuffix: string
): { tableName: string; entities: TableEntityFixture[] } {
  const entities: TableEntityFixture[] = [];
  for (let i = 0; i < 5; i++) {
    entities.push({
      partitionKey: `partition-${uniqueSuffix}`,
      rowKey: `row-${i}`,
      stringProp: `value with unicode caf\u00e9 ${i}`,
      int32Prop: i * 1000,
      int64Prop: `${9007199254740991n + BigInt(i)}`,
      doubleProp: i + 0.5,
      boolProp: i % 2 === 0,
      dateProp: new Date(Date.UTC(2024, 0, 1 + i)),
      guidProp: `00000000-0000-0000-0000-00000000000${i}`,
      binaryProp: Buffer.from(`binary-${i}`)
    });
  }
  return { tableName: `${tableName}${uniqueSuffix}`, entities };
}
