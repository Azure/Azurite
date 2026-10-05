import { randomUUID } from "node:crypto";

import type {
  SetPropertiesParameters,
  SetPropertiesResponse,
  GetPropertiesParameters,
  GetPropertiesResponse,
  GetStatisticsParameters,
  GetStatisticsResponse,
  GetUserDelegationKeyParameters,
  GetUserDelegationKeyResponse,
  GetQueuesParameters,
  GetQueuesResponse,
  CreateParameters,
  CreateResponse,
  QueueGetPropertiesParameters,
  QueueGetPropertiesResponse,
  DeleteParameters,
  DeleteResponse,
  SetMetadataParameters,
  SetMetadataResponse,
  GetAccessPolicyParameters,
  GetAccessPolicyResponse,
  SetAccessPolicyParameters,
  SetAccessPolicyResponse,
  ReceiveMessagesParameters,
  ReceiveMessagesResponse,
  ClearParameters,
  ClearResponse,
  SendMessageParameters,
  SendMessageResponse,
  PeekMessagesParameters,
  PeekMessagesResponse,
  UpdateMessageParameters,
  UpdateMessageResponse,
  DeleteMessageParameters,
  DeleteMessageResponse,
} from "../generated/operations";
import type { Context, IServiceHandler } from "../generated/handlers";
import type { QueueServiceProperties, SignedIdentifier } from "../generated/models";

interface StoredMessage {
  messageId: string;
  messageText: string;
  insertionTime: string;
  expirationTime: string;
  popReceipt: string;
  timeNextVisible: string;
  dequeueCount: number;
  visibleAt: number;
}

interface StoredQueue {
  metadata?: string;
  signedIdentifiers: SignedIdentifier[];
  messages: StoredMessage[];
}

const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;

/**
 * Hand-written business logic implementing the real Storage Queue `IServiceHandler` contract
 * emitted by the pilot TypeSpec emitter (see `typespec-emitter-pilot`'s companion
 * `Azure/typespec-azure` PR) from the vendored, unchanged Azure Storage Queue TypeSpec plus the
 * `azurite.tsp` overlay (`fixture/storage-queue-real/`). Analogous to Azurite's real hand-written
 * `src/queue/handlers/QueueHandler.ts`/`MessagesHandler.ts` filling in the AutoRest-generated
 * `IQueueHandler`/`IMessagesHandler` interfaces.
 *
 * It is deliberately a minimal in-memory implementation (no persistence, no SQL metadata store,
 * no real auth/signature validation, no XML (de)serialization - request/response bodies are
 * treated as plain JS objects, not the real wire XML format, which is explicitly out of scope;
 * see the top-level README). Proving the generated interface/types for a *real* Storage spec are
 * implementable and usable by hand-written logic, wired to real HTTP via the generated route
 * metadata, is the point - not reproducing Azurite's full persistence/auth/XML layers.
 */
export class RealQueueHandler implements IServiceHandler {
  private serviceProperties: QueueServiceProperties = {};
  private readonly queues = new Map<string, StoredQueue>();

  private getOrCreateQueue(queueName: string): StoredQueue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = { signedIdentifiers: [], messages: [] };
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  async setProperties(
    params: SetPropertiesParameters,
    _context: Context,
  ): Promise<SetPropertiesResponse> {
    this.serviceProperties = params.body;
    return { statusCode: 202, headers: { version: "2025-05-05", date: new Date().toUTCString() } };
  }

  async getProperties(
    _params: GetPropertiesParameters,
    _context: Context,
  ): Promise<GetPropertiesResponse> {
    return {
      statusCode: 200,
      headers: { version: "2025-05-05", date: new Date().toUTCString() },
      body: this.serviceProperties,
    };
  }

  async getStatistics(
    _params: GetStatisticsParameters,
    _context: Context,
  ): Promise<GetStatisticsResponse> {
    return {
      statusCode: 200,
      headers: { version: "2025-05-05", date: new Date().toUTCString() },
      body: { geoReplication: { status: "live", lastSyncTime: new Date().toUTCString() } },
    };
  }

  async getUserDelegationKey(
    params: GetUserDelegationKeyParameters,
    _context: Context,
  ): Promise<GetUserDelegationKeyResponse> {
    return {
      statusCode: 200,
      headers: { version: "2025-05-05", date: new Date().toUTCString() },
      body: {
        signedOid: randomUUID(),
        signedTid: randomUUID(),
        signedStart: params.body.start ?? new Date().toISOString(),
        signedExpiry: params.body.expiry,
        signedService: "q",
        signedVersion: "2025-05-05",
        value: randomUUID(),
      },
    };
  }

  async getQueues(params: GetQueuesParameters, _context: Context): Promise<GetQueuesResponse> {
    const names = [...this.queues.keys()].filter(
      (name) => !params.prefix || name.startsWith(params.prefix),
    );
    const maxResults = params.maxresults ?? names.length;
    return {
      statusCode: 200,
      headers: { version: "2025-05-05", date: new Date().toUTCString() },
      body: {
        serviceEndpoint: "http://127.0.0.1/",
        prefix: params.prefix ?? "",
        maxResults,
        queueItems: names.slice(0, maxResults).map((name) => ({
          name,
          metadata: this.queues.get(name)?.metadata
            ? { raw: this.queues.get(name)!.metadata! }
            : undefined,
        })),
        nextMarker: "",
      },
    };
  }

  async create(params: CreateParameters, _context: Context): Promise<CreateResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    queue.metadata = params.metadata ?? queue.metadata;
    return { statusCode: 201, headers: { version: "2025-05-05", date: new Date().toUTCString() } };
  }

  async queueGetProperties(
    params: QueueGetPropertiesParameters,
    _context: Context,
  ): Promise<QueueGetPropertiesResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    return {
      statusCode: 200,
      headers: {
        metadata: queue.metadata,
        approximateMessagesCount: queue.messages.length,
        version: "2025-05-05",
        date: new Date().toUTCString(),
      },
    };
  }

  async delete(params: DeleteParameters, _context: Context): Promise<DeleteResponse> {
    this.queues.delete(this.queueNameFrom(params));
    return { statusCode: 204, headers: { version: "2025-05-05", date: new Date().toUTCString() } };
  }

  async setMetadata(
    params: SetMetadataParameters,
    _context: Context,
  ): Promise<SetMetadataResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    queue.metadata = params.metadata;
    return { statusCode: 204, headers: { version: "2025-05-05", date: new Date().toUTCString() } };
  }

  async getAccessPolicy(
    params: GetAccessPolicyParameters,
    _context: Context,
  ): Promise<GetAccessPolicyResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    return {
      statusCode: 200,
      headers: { version: "2025-05-05", date: new Date().toUTCString() },
      body: { items: queue.signedIdentifiers },
    };
  }

  async setAccessPolicy(
    params: SetAccessPolicyParameters,
    _context: Context,
  ): Promise<SetAccessPolicyResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    queue.signedIdentifiers = params.body.items;
    return { statusCode: 204, headers: { version: "2025-05-05", date: new Date().toUTCString() } };
  }

  async receiveMessages(
    params: ReceiveMessagesParameters,
    _context: Context,
  ): Promise<ReceiveMessagesResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    const now = Date.now();
    const limit = params.numberOfMessages ?? 1;
    const visibilityTimeoutMs = (params.visibilityTimeout ?? 30) * 1000;
    const visible = queue.messages.filter((m) => m.visibleAt <= now).slice(0, limit);
    for (const message of visible) {
      message.dequeueCount += 1;
      message.popReceipt = randomUUID();
      message.visibleAt = now + visibilityTimeoutMs;
      message.timeNextVisible = new Date(message.visibleAt).toUTCString();
    }
    return {
      statusCode: 200,
      headers: { version: "2025-05-05", date: new Date().toUTCString() },
      body: { items: visible.map((m) => ({ ...m })) },
    };
  }

  async clear(params: ClearParameters, _context: Context): Promise<ClearResponse> {
    this.getOrCreateQueue(this.queueNameFrom(params)).messages = [];
    return { statusCode: 204, headers: { version: "2025-05-05", date: new Date().toUTCString() } };
  }

  async sendMessage(
    params: SendMessageParameters,
    _context: Context,
  ): Promise<SendMessageResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    const ttlSeconds = Math.min(params.messageTimeToLive ?? ONE_WEEK_SECONDS, ONE_WEEK_SECONDS);
    const now = Date.now();
    const message: StoredMessage = {
      messageId: randomUUID(),
      messageText: params.body.messageText,
      insertionTime: new Date(now).toUTCString(),
      expirationTime: new Date(now + ttlSeconds * 1000).toUTCString(),
      popReceipt: randomUUID(),
      timeNextVisible: new Date(now + (params.visibilityTimeout ?? 0) * 1000).toUTCString(),
      dequeueCount: 0,
      visibleAt: now + (params.visibilityTimeout ?? 0) * 1000,
    };
    queue.messages.push(message);
    return {
      statusCode: 201,
      headers: { version: "2025-05-05", date: new Date().toUTCString() },
      body: {
        items: [
          {
            messageId: message.messageId,
            insertionTime: message.insertionTime,
            expirationTime: message.expirationTime,
            popReceipt: message.popReceipt,
            timeNextVisible: message.timeNextVisible,
          },
        ],
      },
    };
  }

  async peekMessages(
    params: PeekMessagesParameters,
    _context: Context,
  ): Promise<PeekMessagesResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    const now = Date.now();
    const limit = params.numberOfMessages ?? 1;
    const visible = queue.messages.filter((m) => m.visibleAt <= now).slice(0, limit);
    return {
      statusCode: 200,
      headers: { version: "2025-05-05", date: new Date().toUTCString() },
      body: {
        items: visible.map((m) => ({
          messageId: m.messageId,
          insertionTime: m.insertionTime,
          expirationTime: m.expirationTime,
          dequeueCount: m.dequeueCount,
          messageText: m.messageText,
        })),
      },
    };
  }

  async updateMessage(
    params: UpdateMessageParameters,
    _context: Context,
  ): Promise<UpdateMessageResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    const message = queue.messages.find(
      (m) => m.messageId === params.messageId && m.popReceipt === params.popReceipt,
    );
    if (!message) {
      return { statusCode: 404, headers: { errorCode: "MessageNotFound" }, body: {} };
    }
    message.messageText = params.body.messageText;
    message.popReceipt = randomUUID();
    message.visibleAt = Date.now() + params.visibilityTimeout * 1000;
    message.timeNextVisible = new Date(message.visibleAt).toUTCString();
    return {
      statusCode: 204,
      headers: {
        popReceipt: message.popReceipt,
        timeNextVisible: message.timeNextVisible,
        version: "2025-05-05",
        date: new Date().toUTCString(),
      },
    };
  }

  async deleteMessage(
    params: DeleteMessageParameters,
    _context: Context,
  ): Promise<DeleteMessageResponse> {
    const queue = this.getOrCreateQueue(this.queueNameFrom(params));
    queue.messages = queue.messages.filter(
      (m) => !(m.messageId === params.messageId && m.popReceipt === params.popReceipt),
    );
    return { statusCode: 204, headers: { version: "2025-05-05", date: new Date().toUTCString() } };
  }

  /**
   * The generated `*Parameters` types for queue-scoped operations have no `queueName` property
   * (see the dispatcher's `QUEUE_SCOPED_OPERATIONS` comment for why) - the dispatcher resolves
   * the Express `:queueName` route param and stashes it under this out-of-band property before
   * invoking the handler, deliberately outside the generated contract.
   */
  private queueNameFrom(params: unknown): string {
    return (params as { queueName?: string }).queueName ?? "default";
  }

  /** Test-only seam so tests can assert queue/message state directly. */
  listQueueNames(): string[] {
    return [...this.queues.keys()];
  }
}
