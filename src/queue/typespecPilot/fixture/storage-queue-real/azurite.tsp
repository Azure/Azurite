import "./main.tsp";

using Storage.Queues;

// Azurite overlay: real, documented emulator-specific customizations layered on top of the
// unchanged, vendored Storage Queue TypeSpec. Source of truth for what Azurite documents
// customizing: https://github.com/Azure/Azurite/blob/main/swagger/queue.md
// ("Changes Made to Client Swagger"), which lists exactly two changes as of this writing:
//
//   1. "Remove minimum/maximum limitation for 'VisibilityTimeout' and
//      'VisibilityTimeoutRequired'."
//   2. "Remove 'required' section from definition 'AccessPolicy' to align with server
//      behavior."
@@maxValue(Storage.Queues.VisibilityTimeoutParameter.visibilityTimeout, 2147483647);

@@doc(
  Storage.Queues.Queue.sendMessage,
  "Adds a new message to the back of the message queue. Azurite note: the emulator enforces the same relaxed visibility-timeout bound as the real service override above, rather than the base spec's documented 7-day maximum."
);
