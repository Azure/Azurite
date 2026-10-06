import "./main.tsp";
import "@azure-tools/typespec-azurite-emitter";

using Storage.Queues;
using Azurite;

@@operationEnumName(Storage.Queues.Service.setProperties, "Service_SetProperties");
@@dispatchPattern(Storage.Queues.Service.setProperties, "/");
@@operationEnumName(Storage.Queues.Service.getProperties, "Service_GetProperties");
@@dispatchPattern(Storage.Queues.Service.getProperties, "/");
@@operationEnumName(Storage.Queues.Service.getStatistics, "Service_GetStatistics");
@@dispatchPattern(Storage.Queues.Service.getStatistics, "/");
@@dispatchPattern(Storage.Queues.Service.getUserDelegationKey, "/");
@@operationEnumName(Storage.Queues.Service.getQueues, "Service_ListQueuesSegment");
@@dispatchPattern(Storage.Queues.Service.getQueues, "/");

@@operationEnumName(Storage.Queues.Queue.create, "Queue_Create");
@@dispatchPattern(Storage.Queues.Queue.create, "/queue");
@@operationEnumName(Storage.Queues.Queue.getProperties, "Queue_GetProperties");
@@dispatchPattern(Storage.Queues.Queue.getProperties, "/queue");
@@operationEnumName(Storage.Queues.Queue.delete, "Queue_Delete");
@@dispatchPattern(Storage.Queues.Queue.delete, "/queue");
@@operationEnumName(Storage.Queues.Queue.setMetadata, "Queue_SetMetadata");
@@dispatchPattern(Storage.Queues.Queue.setMetadata, "/queue");
@@operationEnumName(Storage.Queues.Queue.getAccessPolicy, "Queue_GetAccessPolicy");
@@dispatchPattern(Storage.Queues.Queue.getAccessPolicy, "/queue");
@@operationEnumName(Storage.Queues.Queue.setAccessPolicy, "Queue_SetAccessPolicy");
@@dispatchPattern(Storage.Queues.Queue.setAccessPolicy, "/queue");
@@operationEnumName(Storage.Queues.Queue.receiveMessages, "Messages_Dequeue");
@@dispatchPattern(Storage.Queues.Queue.receiveMessages, "/queue/messages");
@@operationEnumName(Storage.Queues.Queue.clear, "Messages_Clear");
@@dispatchPattern(Storage.Queues.Queue.clear, "/queue/messages");
@@operationEnumName(Storage.Queues.Queue.sendMessage, "Messages_Enqueue");
@@dispatchPattern(Storage.Queues.Queue.sendMessage, "/queue/messages");
@@operationEnumName(Storage.Queues.Queue.peekMessages, "Messages_Peek");
@@dispatchPattern(Storage.Queues.Queue.peekMessages, "/queue/messages");
@@operationEnumName(Storage.Queues.Queue.updateMessage, "MessageId_Update");
@@dispatchPattern(Storage.Queues.Queue.updateMessage, "/queue/messages/messageId");
@@operationEnumName(Storage.Queues.Queue.deleteMessage, "MessageId_Delete");
@@dispatchPattern(Storage.Queues.Queue.deleteMessage, "/queue/messages/messageId");

@@maxValue(Storage.Queues.VisibilityTimeoutParameter.visibilityTimeout, 2147483647);

@@makeOptional(Storage.Queues.AccessPolicy.start);
@@makeOptional(Storage.Queues.AccessPolicy.expiry);
@@makeOptional(Storage.Queues.AccessPolicy.permission);
