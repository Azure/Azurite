import * as  BbPromise from "bluebird";
import { Operations } from "../../core/Constants";

import ClearMessages from "./../../actions/queue/ClearMessages";
import CreateQueue from "./../../actions/queue/CreateQueue";
import DeleteMessage from "./../../actions/queue/DeleteMessage";
import DeleteQueue from "./../../actions/queue/DeleteQueue";
import GetMessages from "./../../actions/queue/GetMessages";
import GetQueueAcl from "./../../actions/queue/GetQueueAcl";
import GetQueueMetadata from "./../../actions/queue/GetQueueMetadata";
import ListQueues from "./../../actions/queue/ListQueues";
import PeekMessages from "./../../actions/queue/PeekMessages";
import PutMessage from "./../../actions/queue/PutMessage";
import SetQueueAcl from "./../../actions/queue/SetQueueAcl";
import SetQueueMetadata from "./../../actions/queue/SetQueueMetadata";
import UpdateMessage from "./../../actions/queue/UpdateMessage";

export default (req, res) => {
  BbPromise.try(() => {
    actions[req.azuriteOperation](req.azuriteRequest, res);
  }).catch(e => {
    res.status(e.statusCode || 500).send(e.message);
    if (!e.statusCode) {
      throw e;
    }
  });
};

const actions = {};

actions[Operations.Queue.LIST_QUEUES] = (request, res) => {
  ListQueues.process(request, res);
};

actions[Operations.Queue.CREATE_QUEUE] = (request, res) => {
  CreateQueue.process(request, res);
};

actions[Operations.Queue.DELETE_QUEUE] = (request, res) => {
  DeleteQueue.process(request, res);
};

actions[Operations.Queue.SET_QUEUE_METADATA] = (request, res) => {
  SetQueueMetadata.process(request, res);
};

actions[Operations.Queue.GET_QUEUE_METADATA] = (request, res) => {
  GetQueueMetadata.process(request, res);
};

actions[Operations.Queue.PUT_MESSAGE] = (request, res) => {
  PutMessage.process(request, res);
};

actions[Operations.Queue.GET_MESSAGE] = (request, res) => {
  GetMessages.process(request, res);
};

actions[Operations.Queue.CLEAR_MESSAGES] = (request, res) => {
  ClearMessages.process(request, res);
};

actions[Operations.Queue.PEEK_MESSAGES] = (request, res) => {
  PeekMessages.process(request, res);
};

actions[Operations.Queue.DELETE_MESSAGE] = (request, res) => {
  DeleteMessage.process(request, res);
};

actions[Operations.Queue.UPDATE_MESSAGE] = (request, res) => {
  UpdateMessage.process(request, res);
};

actions[Operations.Queue.SET_QUEUE_ACL] = (request, res) => {
  SetQueueAcl.process(request, res);
};

actions[Operations.Queue.GET_QUEUE_ACL] = (request, res) => {
  GetQueueAcl.process(request, res);
};
