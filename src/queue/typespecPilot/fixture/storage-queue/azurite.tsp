import "./main.tsp";
import "@azure-tools/typespec-azurite-emitter";

using Storage.Queues;
using Azurite;
using Azure.ClientGenerator.Core;

@@clientName(Storage.Queues.Service.setProperties, "Service_SetProperties");
@@clientName(Storage.Queues.Service.getProperties, "Service_GetProperties");
@@clientName(Storage.Queues.Service.getStatistics, "Service_GetStatistics");
@@clientName(Storage.Queues.Service.getQueues, "Service_ListQueuesSegment");

@@clientName(Storage.Queues.Queue.create, "Queue_Create");
@@clientName(Storage.Queues.Queue.getProperties, "Queue_GetProperties");
@@clientName(Storage.Queues.Queue.delete, "Queue_Delete");
@@clientName(Storage.Queues.Queue.setMetadata, "Queue_SetMetadata");
@@clientName(Storage.Queues.Queue.getAccessPolicy, "Queue_GetAccessPolicy");
@@clientName(Storage.Queues.Queue.setAccessPolicy, "Queue_SetAccessPolicy");
@@clientName(Storage.Queues.Queue.receiveMessages, "Messages_Dequeue");
@@clientName(Storage.Queues.Queue.clear, "Messages_Clear");
@@clientName(Storage.Queues.Queue.sendMessage, "Messages_Enqueue");
@@clientName(Storage.Queues.Queue.peekMessages, "Messages_Peek");
@@clientName(Storage.Queues.Queue.updateMessage, "MessageId_Update");
@@clientName(Storage.Queues.Queue.deleteMessage, "MessageId_Delete");

@@maxValue(Storage.Queues.VisibilityTimeoutParameter.visibilityTimeout, 2147483647);

@@makeOptional(Storage.Queues.AccessPolicy.start);
@@makeOptional(Storage.Queues.AccessPolicy.expiry);
@@makeOptional(Storage.Queues.AccessPolicy.permission);
