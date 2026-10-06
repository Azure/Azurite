import "./main.tsp";
import "@azure-tools/typespec-azurite-emitter";

using Storage.Queues;
using Azurite;

@@maxValue(Storage.Queues.VisibilityTimeoutParameter.visibilityTimeout, 2147483647);

@@makeOptional(Storage.Queues.AccessPolicy.start);
@@makeOptional(Storage.Queues.AccessPolicy.expiry);
@@makeOptional(Storage.Queues.AccessPolicy.permission);
