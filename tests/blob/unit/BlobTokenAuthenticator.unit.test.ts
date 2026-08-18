import * as assert from "assert";

import IAccountDataStore, {
  IAccountProperties
} from "../../../src/common/IAccountDataStore";
import ILogger from "../../../src/common/ILogger";
import { OAuthLevel } from "../../../src/common/models";
import BlobTokenAuthenticator from "../../../src/blob/authentication/BlobTokenAuthenticator";
import BlobStorageContext from "../../../src/blob/context/BlobStorageContext";
import IRequest from "../../../src/blob/generated/IRequest";
import {
  BEARER_TOKEN_PREFIX
} from "../../../src/common/utils/constants";
import { HeaderConstants } from "../../../src/blob/utils/constants";

describe("BlobTokenAuthenticator Unit Tests @loki", () => {
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
      getUrl: () => "https://devstoreaccount1.blob.core.windows.net/",
      getEndpoint: () => "https://devstoreaccount1.blob.core.windows.net/",
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
    const context = new BlobStorageContext(holder, "context", req);
    context.account = "devstoreaccount1";
    context.startTime = new Date();

    // Cast an invalid value to OAuthLevel to exercise the default branch,
    // simulating a misconfigured/unknown OAuth level.
    const invalidOAuthLevel = "invalid-level" as unknown as OAuthLevel;
    const authenticator = new BlobTokenAuthenticator(
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
});
