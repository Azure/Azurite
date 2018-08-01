'use strict';

import BbPromise from 'bluebird';
import { Operations } from './../../core/Constants';

// Actions
import deleteQueue from './../../actions/queue/DeleteQueue';

import setQueueMetadata from './../../actions/queue/SetQueueMetadata';
import getQueueMetadata from './../../actions/queue/GetQueueMetadata';
import putMessage from './../../actions/queue/PutMessage';
import getMessages from './../../actions/queue/GetMessages';
import clearMessages from './../../actions/queue/ClearMessages';
import peekMessages from './../../actions/queue/PeekMessages';
import deleteMessage from './../../actions/queue/DeleteMessage';
import updateMessage from './../../actions/queue/UpdateMessage';
import listQueues from './../../actions/queue/ListQueues';
import setQueueAcl from './../../actions/queue/SetQueueAcl';
import getQueueAcl from './../../actions/queue/GetQueueAcl';
import createQueue from './../../actions/queue/CreateQueue';

export default (req, res) => {
    BbPromise.try(() => {
        actions[req.azuriteOperation](req.azuriteRequest, res);
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
};

const actions = {};

actions[undefined] = (request, res) => {
    res.status(501).send('Not Implemented yet.');
}

actions[Operations.Queue.LIST_QUEUES] = (request, res) => {
    listQueues.process(request, res);
}

actions[Operations.Queue.CREATE_QUEUE] = (request, res) => {
    createQueue.process(request, res);
}

actions[Operations.Queue.DELETE_QUEUE] = (request, res) => {
    deleteQueue.process(request, res);
}

actions[Operations.Queue.SET_QUEUE_METADATA] = (request, res) => {
    setQueueMetadata.process(request, res);
}

actions[Operations.Queue.GET_QUEUE_METADATA] = (request, res) => {
    getQueueMetadata.process(request, res);
}

actions[Operations.Queue.PUT_MESSAGE] = (request, res) => {
    putMessage.process(request, res);
}

actions[Operations.Queue.GET_MESSAGE] = (request, res) => {
    getMessages.process(request, res);
}

actions[Operations.Queue.CLEAR_MESSAGES] = (request, res) => {
    clearMessages.process(request, res);
}

actions[Operations.Queue.PEEK_MESSAGES] = (request, res) => {
    peekMessages.process(request, res);
}

actions[Operations.Queue.DELETE_MESSAGE] = (request, res) => {
    deleteMessage.process(request, res);
}

actions[Operations.Queue.UPDATE_MESSAGE] = (request, res) => {
    updateMessage.process(request, res);
}

actions[Operations.Queue.SET_QUEUE_ACL] = (request, res) => {
    setQueueAcl.process(request, res);
}

actions[Operations.Queue.GET_QUEUE_ACL] = (request, res) => {
    getQueueAcl.process(request, res);
}