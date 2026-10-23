/**
 * Unit tests of PathHandler failure handling, with a stub metadata store.
 */

import * as assert from "assert";

import PathHandler from "../../src/blob/dfs/handlers/PathHandler";

function fakeResponse(context: any) {
  const res: any = {
    locals: { dfsContext: context },
    statusCode: 200,
    headers: {} as { [name: string]: string },
    body: undefined as any,
    req: { method: "PUT" },
    status(code: number) { this.statusCode = code; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; },
    json(body: any) { this.body = body; },
    end() { /* response ended */ }
  };
  return res;
}

describe("DFS PathHandler @loki", () => {
  it("removes the hierarchy entry of a path whose blob can't be created", async () => {
    const calls: string[] = [];
    const store: any = {
      getBlobProperties: () => Promise.reject({ statusCode: 404 }),
      registerHnsPath: (_c: any, _a: string, _f: string, path: string) => { calls.push(`register ${path}`); return Promise.resolve(); },
      unregisterHnsPath: (_c: any, _a: string, _f: string, path: string) => { calls.push(`unregister ${path}`); return Promise.resolve(); },
      createBlob: () => Promise.reject(Object.assign(new Error("database unavailable"), { statusCode: 500 }))
    };
    const handler = new PathHandler(store, {} as any);
    const req: any = { query: { resource: "file" }, headers: {} };
    const res = fakeResponse({
      requestId: "request",
      startTime: new Date(),
      account: "devstoreaccount1",
      filesystem: "fs",
      path: "file.txt"
    });

    await handler.create(req, res);

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(calls, ["register file.txt", "unregister file.txt"]);
  });
});
