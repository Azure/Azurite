import QueueName from '../lib/validation/queue/QueueName';
import AError from '../lib/core/AzuriteError';
import ErrorCodes from '../lib/core/ErrorCodes';
import chai from 'chai';

const expect = chai.expect;

describe('validation', () => {
    describe('QueueName', () => {
        const createQueueNameRequest = (queueName) => { return { request: { queueName } } };

        it('should throw out of range if name is less than three characters', () => {
            expect(() => QueueName.validate(createQueueNameRequest(''))).to.throw(ErrorCodes.OutOfRangeInput);
            expect(() => QueueName.validate(createQueueNameRequest('a'))).to.throw(ErrorCodes.OutOfRangeInput);
            expect(() => QueueName.validate(createQueueNameRequest('aa'))).to.throw(ErrorCodes.OutOfRangeInput);
            expect(() => QueueName.validate(createQueueNameRequest('aaa'))).not.to.throw();
        });

        it('should throw out of range if name is greater than sixty three characters', () => {
            const sixtyThreeCharacterStringName = '012345678901234567890123456789012345678901234567890123456789012';

            expect(() => QueueName.validate(createQueueNameRequest(sixtyThreeCharacterStringName))).not.to.throw();
            expect(() => QueueName.validate(createQueueNameRequest(sixtyThreeCharacterStringName + '3'))).to.throw(ErrorCodes.OutOfRangeInput);
            expect(() => QueueName.validate(createQueueNameRequest(sixtyThreeCharacterStringName + '34'))).to.throw(ErrorCodes.OutOfRangeInput);
        });

        it('should throw invalid input if name starts with a dash', () => {
            expect(() => QueueName.validate(createQueueNameRequest("-queue"))).to.throw(ErrorCodes.InvalidInput);
            expect(() => QueueName.validate(createQueueNameRequest("-queue-name"))).to.throw(ErrorCodes.InvalidInput);
        });

        it('should throw invalid input if name ends with a dash', () => {
            expect(() => QueueName.validate(createQueueNameRequest("queue-"))).to.throw(ErrorCodes.InvalidInput);
            expect(() => QueueName.validate(createQueueNameRequest("queue-name-"))).to.throw(ErrorCodes.InvalidInput);
        });

        it('should throw invalid input if contians two consecutive dashes', () => {
            expect(() => QueueName.validate(createQueueNameRequest("queue--name"))).to.throw(ErrorCodes.InvalidInput);
        });

        it('should throw invalid input if contians anything except alphanumeric characters and dashes', () => {
            expect(() => QueueName.validate(createQueueNameRequest("queue-name"))).not.to.throw();
            expect(() => QueueName.validate(createQueueNameRequest("queue1"))).not.to.throw();
            expect(() => QueueName.validate(createQueueNameRequest("QUEUE-name-1"))).not.to.throw();
            expect(() => QueueName.validate(createQueueNameRequest("queue_name"))).to.throw(ErrorCodes.InvalidInput);
            expect(() => QueueName.validate(createQueueNameRequest("queue name"))).to.throw(ErrorCodes.InvalidInput);
            expect(() => QueueName.validate(createQueueNameRequest("queue~name"))).to.throw(ErrorCodes.InvalidInput);
            expect(() => QueueName.validate(createQueueNameRequest("queue@name"))).to.throw(ErrorCodes.InvalidInput);
            expect(() => QueueName.validate(createQueueNameRequest("queue:name"))).to.throw(ErrorCodes.InvalidInput);
        });
    });
});
