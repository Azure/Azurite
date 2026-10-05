import "@typespec/http";

using Http;

/**
 * Minimal, self-contained "Queue-like" service used as a pilot fixture.
 *
 * This deliberately does NOT model real Azure Storage Queue - it only reproduces the
 * representative HTTP shapes (query-string routing, JSON request/response bodies, and
 * custom response headers) that the Azurite emitter pilot needs to prove out.
 */
@service(#{ title: "Queue Pilot Service" })
namespace QueuePilot {
  model QueueMetadata {
    /** Arbitrary emulator-defined metadata values for the queue. */
    description?: string;

    /** Whether the queue allows anonymous access. */
    publicAccess?: boolean;
  }

  model QueueProperties {
    /** Name of the queue. */
    name: string;

    /** Arbitrary emulator-defined metadata values for the queue. */
    description?: string;
  }

  model QueueMessage {
    /** Opaque message id assigned by the service. */
    messageId: string;

    /** Message body text. */
    messageText: string;
  }

  model QueueMessageList {
    messages: QueueMessage[];
  }

  @route("/{queueName}")
  @put
  op createQueue(@path queueName: string, @body metadata: QueueMetadata): {
    @statusCode statusCode: 201;
    @header("x-ms-request-id") requestId: string;
  };

  @route("/{queueName}")
  @get
  op getQueueProperties(@path queueName: string): {
    @statusCode statusCode: 200;
    @header("x-ms-approximate-messages-count") approximateMessagesCount: int32;
    @body properties: QueueProperties;
  };

  @route("/{queueName}/messages")
  @get
  op listMessages(
    @path queueName: string,
    @query numOfMessages?: int32,
    @query visibilityTimeout?: int32,
  ): {
    @statusCode statusCode: 200;
    @body messages: QueueMessageList;
  };
}
