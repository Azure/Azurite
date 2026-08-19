import * as assert from "assert";

import IAccountDataStore, {
  IAccountProperties
} from "../../../src/common/IAccountDataStore";
import ILogger from "../../../src/common/ILogger";
import { OAuthLevel } from "../../../src/common/models";
import {
  BEARER_TOKEN_PREFIX
} from "../../../src/common/utils/constants";
import AuthenticationMiddlewareFactory from "../../../src/table/middleware/AuthenticationMiddlewareFactory";
import TableTokenAuthenticator from "../../../src/table/authentication/TableTokenAuthenticator";
import TableStorageContext from "../../../src/table/context/TableStorageContext";
import IRequest from "../../../src/table/generated/IRequest";
import { DEFAULT_TABLE_CONTEXT_PATH, HeaderConstants } from "../../../src/table/utils/constants";

describe("TableTokenAuthenticator Unit Tests @loki", () => {
  function createTestLogger(events: string[]): ILogger {
    return {
      error: (message: string) => events.push(`error:${message}`),
      warn: (message: string) => events.push(`warn:${message}`),
      info: (message: string) => events.push(`info:${message}`),
      verbose: () => {
        // no-op for these tests
      },
      debug: () => {
        // no-op for these tests
      }
    };
  }

  function createDataStore(): IAccountDataStore {
    const properties: IAccountProperties = {
      name: "devstoreaccount1",
      key1: Buffer.from("key")
    };
    return {
      isInitialized: () => true,
      isClosed: () => false,
      init: async () => {
        // no-op
      },
      close: async () => {
        // no-op
      },
      clean: async () => {
        // no-op
      },
      getAccount: () => properties
    } as IAccountDataStore;
  }

  function createRequest(): IRequest {
    return {
      getMethod: () => "GET",
      getUrl: () => "https://devstoreaccount1.table.core.windows.net/",
      getEndpoint: () => "https://devstoreaccount1.table.core.windows.net/",
      getPath: () => "/",
      getBodyStream: () => undefined as any,
      setBody: () => undefined as any,
      getBody: () => undefined,
      getHeader: (field: string) =>
        field === HeaderConstants.AUTHORIZATION
          ? `${BEARER_TOKEN_PREFIX} sample-jwt-token`
          : undefined,
      getHeaders: () => ({}),
      getRawHeaders: () => [],
      getQuery: () => undefined,
      getProtocol: () => "https"
    };
  }

  it("does not include the raw OAuth level value in the 'Unknown OAuth level' warning", async () => {
    const events: string[] = [];
    const logger = createTestLogger(events);
    const req = createRequest();
    const holder: any = {};
    const context = new TableStorageContext(holder, "context", req);
    context.account = "devstoreaccount1";
    context.startTime = new Date();

    // Cast an invalid value to OAuthLevel to exercise the default branch,
    // simulating a misconfigured/unknown OAuth level.
    const invalidOAuthLevel = "invalid-level" as unknown as OAuthLevel;
    const authenticator = new TableTokenAuthenticator(
      createDataStore(),
      invalidOAuthLevel,
      logger
    );

    const result = await authenticator.validate(req, context);

    assert.strictEqual(result, undefined);
    const warnEvent = events.find((e) =>
      e.includes("Unknown OAuth level")
    );
    assert.ok(warnEvent, "should log unknown OAuth level warning");
    assert.ok(
      !warnEvent!.includes(invalidOAuthLevel as unknown as string),
      "warning message should not include the raw OAuth level value"
    );
  });

  it("denies the request end-to-end through AuthenticationMiddlewareFactory when OAuth level is unknown", async () => {
    const events: string[] = [];
    const logger = createTestLogger(events);
    const holder: any = {};

    // Pre-seed the account on the same holder object the middleware will
    // use, so the context it builds internally sees the same account.
    const seedContext = new TableStorageContext(
      holder,
      DEFAULT_TABLE_CONTEXT_PATH
    );
    seedContext.account = "devstoreaccount1";
    seedContext.startTime = new Date();

    const invalidOAuthLevel = "invalid-level" as unknown as OAuthLevel;
    const authenticator = new TableTokenAuthenticator(
      createDataStore(),
      invalidOAuthLevel,
      logger
    );

    const expressReq: any = {
      method: "GET",
      url: "/",
      protocol: "https",
      hostname: "devstoreaccount1.table.core.windows.net",
      path: "/",
      body: undefined,
      headers: {},
      rawHeaders: [],
      query: {},
      header: (field: string) =>
        field.toLowerCase() === HeaderConstants.AUTHORIZATION.toLowerCase()
          ? `${BEARER_TOKEN_PREFIX} sample-jwt-token`
          : undefined
    };
    const expressRes: any = { locals: holder };

    // Exercise the real production authentication pipeline (not just the
    // authenticator in isolation) to confirm the request is actually
    // rejected, rather than only asserting on log content.
    const factory = new AuthenticationMiddlewareFactory(logger);
    const pass = await (factory as any).authenticate(
      expressReq,
      expressRes,
      [authenticator]
    );

    assert.strictEqual(
      pass,
      false,
      "request should not be authenticated when OAuth level is unknown"
    );
  });
});
