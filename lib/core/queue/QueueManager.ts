import Queue from "../../model/queue/Queue";

/**
 * Manages the lifecycle of all queues in memory. Queues are not persisted in Azurite.
 *
 * @class QueueManager
 */
class QueueManager {
  public queues: any[] = [];

  public add({ name, metaProps = {} }) {
    this.queues[name] = new Queue(metaProps);
  }

  public delete(name) {
    delete this.queues[name];
  }

  public getQueueAndMessage(queueName, messageId?: any) {
    const queue = this.queues[queueName];
    let message;
    if (queue !== undefined && messageId !== undefined) {
      message = queue.getMessage(messageId);
    }
    return {
      message,
      queue
    };
  }

  public listQueues({ prefix = "", marker = 0, maxresults = 5000 }) {
    const filteredQueues = Object.keys(this.queues)
      .filter(queueName => {
        return queueName.startsWith(prefix);
      })
      .reduce((list: any[], queueName) => {
        list.push({
          metaProps: this.queues[queueName].metaProps,
          name: queueName
        });
        return list;
      }, [])
      .sort((lhs, rhs) => {
        return rhs.name - lhs.name;
      });

    const paginatedQueues = filteredQueues.slice(
      marker * maxresults,
      (marker + 1) * maxresults
    );
    return {
      nextMarker:
        this.queues.length > (marker + 1) * maxresults ? marker + 1 : undefined,
      queues: paginatedQueues
    };
  }

  public setQueueMetadata(request) {
    const { queue } = this.getQueueAndMessage(request.queueName);
    queue.metaProps = request.metaProps;
  }
}

export default new QueueManager();
