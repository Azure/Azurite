import type {
  CreateQueueParameters,
  CreateQueueResponse,
  GetQueuePropertiesParameters,
  GetQueuePropertiesResponse,
  ListMessagesParameters,
  ListMessagesResponse,
} from "../generated/operations";
import type { Context, IServiceHandler } from "../generated/handlers";
import type { QueueMessage } from "../generated/models";

interface StoredQueue {
  description?: string;
  messages: QueueMessage[];
}

/**
 * Hand-written business logic implementing the `IServiceHandler` contract that was emitted by
 * the pilot TypeSpec emitter (see `typespec-emitter-pilot/generated/handlers.ts`). This is the
 * part of a real Azurite port that is *not* generated: the actual storage/queue semantics an
 * engineer would write, analogous to Azurite's real hand-written
 * `src/queue/handlers/QueueHandler.ts`/`MessagesHandler.ts` filling in the AutoRest-generated
 * `IQueueHandler`/`IMessagesHandler` interfaces.
 *
 * It is deliberately a minimal in-memory implementation (no persistence, no SQL metadata store,
 * no auth) - proving the generated interface/types are implementable and usable by hand-written
 * logic is the point, not reproducing Azurite's full persistence layer.
 */
export class InMemoryQueueHandler implements IServiceHandler {
  private readonly queues = new Map<string, StoredQueue>();

  async createQueue(
    params: CreateQueueParameters,
    _context: Context,
  ): Promise<CreateQueueResponse> {
    this.queues.set(params.queueName, {
      description: params.body.description,
      messages: [],
    });
    return {
      statusCode: 201,
      headers: { requestId: `pilot-${Date.now()}` },
    };
  }

  async getQueueProperties(
    params: GetQueuePropertiesParameters,
    _context: Context,
  ): Promise<GetQueuePropertiesResponse> {
    // The pilot's toy fixture only models a single success response per operation (no 404
    // variant), so auto-vivifying an empty queue on first read keeps this handwritten layer
    // honest to the generated contract rather than papering over the gap with a thrown error.
    // See the companion PR's README for this as a documented, known simplification.
    const queue = this.queues.get(params.queueName) ?? { messages: [] };
    this.queues.set(params.queueName, queue);
    return {
      statusCode: 200,
      headers: { approximateMessagesCount: queue.messages.length },
      body: { name: params.queueName, description: queue.description },
    };
  }

  async listMessages(
    params: ListMessagesParameters,
    _context: Context,
  ): Promise<ListMessagesResponse> {
    const queue = this.queues.get(params.queueName) ?? { messages: [] };
    const limit = params.numOfMessages ?? queue.messages.length;
    return {
      statusCode: 200,
      body: { messages: queue.messages.slice(0, limit) },
    };
  }

  /** Test-only seam so the e2e test can assert listMessages against non-empty data. */
  seedMessage(queueName: string, message: QueueMessage): void {
    const queue = this.queues.get(queueName) ?? { messages: [] };
    queue.messages.push(message);
    this.queues.set(queueName, queue);
  }
}
