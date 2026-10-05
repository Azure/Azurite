import "./base.tsp";

/**
 * Example "azurite overlay" file: it imports the (unchanged) base service definition and
 * layers emulator-specific documentation on top of it via augment decorators, without
 * modifying `main.tsp`. This models the real Azurite migration's `azurite.tsp` overlay,
 * which will layer emulator-specific adaptations on top of the existing, unchanged Azure
 * Storage TypeSpec.
 */
using QueuePilot;

@@doc(
  QueuePilot.createQueue,
  "Azurite note: queue creation is idempotent in the emulator and never returns a conflict."
);
@@doc(
  QueuePilot.QueueMetadata.publicAccess,
  "Azurite note: public access is always treated as disabled by the emulator."
);
