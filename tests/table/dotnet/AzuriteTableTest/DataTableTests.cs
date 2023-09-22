using System;
using System.Collections.Generic;
using System.Text;
using NUnit.Framework;
using System.Threading.Tasks;
using Azure.Data.Tables;
using System.Collections;
using Azure;

namespace AzuriteTableTest
{
    [TestFixture]
    public class DataTablesTests
    {
        TableServiceClient client;

        [SetUp]
        public void Setup()
        {
            this.client = new TableServiceClient("UseDevelopmentStorage=true");
        }

        // from issue 793
        [Test]
        public async Task CheckForPreconditionFailedError()
        {
            var table = client.GetTableClient("PreconditionFailed");
            await table.CreateIfNotExistsAsync();

            var pk = Guid.NewGuid().ToString();
            var rA = await table.AddEntityAsync(new TableEntity(pk, "a"));
            await table.UpsertEntityAsync(new TableEntity(pk, "a"));

            var actions = new[]
            {
                new TableTransactionAction(TableTransactionActionType.UpdateReplace, new TableEntity(pk, "a"), rA.Headers.ETag.Value),
            };

            try
            {
                await table.SubmitTransactionAsync(actions);
            }
            catch (TableTransactionFailedException ex)
            {
                // When replacing an entity with an etag condition, the Azurite table emulator should not
                // accept the entity replace if the etag is wrong.
                // (i.e.does not match the current entity state).
                // Azure and the legacy emulator return HTTP 412 Precondition failed.
                Assert.AreEqual(ex.Status, 412);
                // we got the expected error so should pass the test
                Assert.Pass();
            }
            // we did not land in the try catch so should fail
            // We use this pattern for the rest of the tests.
            Assert.Fail();
        }

        // Issue 791
        [Test]
        public async Task ExpectStatus409WhenAddingExistingEntityInBatch()
        {
            var table = client.GetTableClient("AddInBatch");
            await table.CreateIfNotExistsAsync();
            var pk = Guid.NewGuid().ToString();
            await table.AddEntityAsync(new TableEntity(pk, "a"));
            var actions = new[]
            {
                new TableTransactionAction(TableTransactionActionType.Add, new TableEntity(pk, "a")),
            };
            try
            {
                await table.SubmitTransactionAsync(actions);
            }
            catch (TableTransactionFailedException ex)
            {
                Assert.AreEqual(ex.Status, 409);
                Assert.Pass();
            }
            Assert.Fail();
        }

        // Issue 1286
        [Test]
        public async Task EtagGranularityTests()
        {
            var table = client.GetTableClient("etagGranularity");
            await table.CreateIfNotExistsAsync();

            var pk = Guid.NewGuid().ToString();
            var e1 = await table.UpsertEntityAsync(new TableEntity(pk, "e1"));
            var e2 = await table.UpsertEntityAsync(new TableEntity(pk, "e1"));
            var e3 = await table.UpsertEntityAsync(new TableEntity(pk, "e1"));

            Assert.AreNotEqual(e1.Headers.ETag, e2.Headers.ETag);
            Assert.AreNotEqual(e2.Headers.ETag, e3.Headers.ETag);

            var actions = new[]
            {
                new TableTransactionAction(TableTransactionActionType.UpdateReplace, new TableEntity(pk, "e1"), e2.Headers.ETag.Value),
            };

            try
            {
                await table.SubmitTransactionAsync(actions);
            }
            catch (TableTransactionFailedException ex)
            {
                Assert.AreEqual(ex.Status, 412);
                Assert.Pass();
            }

            Assert.Fail("We should have had a precondition failed, 412 status.");
        }

        // Issue 1493
        [Test]
        public async Task UpsertNonExistantEntityShouldFailWith404()
        {
            var table = client.GetTableClient("upsertTests");
            await table.CreateIfNotExistsAsync();

            var pk = Guid.NewGuid().ToString();

            try
            {
                var rA = await table.UpdateEntityAsync(new TableEntity(pk, "a"), new Azure.ETag("*"), TableUpdateMode.Merge);
                Console.WriteLine("Status : " + rA.Status);
            }
            catch (RequestFailedException ex)
            {
                Assert.AreEqual(ex.Status, 404);
                Assert.Pass();
            }

            Assert.Fail();
        }
    }
}
