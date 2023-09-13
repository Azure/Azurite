using System;
using System.Collections.Generic;
using System.Text;
using NUnit.Framework;
using System.Threading.Tasks;
using Microsoft.Azure.Cosmos.Table;
using System.Collections;

namespace AzuriteTableTest
{
    [TestFixture]
    public class CosmosTableTests
    {
        private CloudTableClient cloudTableClient;

        [SetUp]
        public void Setup()
        {
            var account = CloudStorageAccount.DevelopmentStorageAccount;
            this.cloudTableClient = new CloudTableClient(account.TableStorageUri, account.Credentials);
        }

        // Issue 1439
        [Test]
        public async Task ShouldDeleteMultipleRowsInCosmosBatch()
        {
            try
            {
                var cloudTable = cloudTableClient.GetTableReference("test5");
                cloudTable.CreateIfNotExists();

                TableEntity entity = new TableEntity() { PartitionKey = "1", RowKey = "1" };

                for (int i = 0; i < 13; i++)
                {
                    entity.RowKey = i.ToString();
                    TableOperation insertOperation = TableOperation.Insert(entity);
                    cloudTable.Execute(insertOperation);
                    Console.WriteLine("Entity inserted!");
                }

                TableBatchOperation batch = new TableBatchOperation();
                var query = new TableQuery().Where("PartitionKey eq '1'");
                TableQuerySegment<DynamicTableEntity> tableData = await cloudTable.ExecuteQuerySegmentedAsync(query, null);

                foreach (var tableEntity in tableData)
                {
                    batch.Delete(tableEntity);

                    if (batch.Count == 100) // cutoff at 100 to not exceed batch limits
                    {
                        await cloudTable.ExecuteBatchAsync(batch);
                        batch.Clear();
                    }
                }

                if (batch.Count > 0)
                {
                    var batchResult = await cloudTable.ExecuteBatchAsync(batch); // <- error thrown here
                    if (batchResult.Count == 0)
                    {
                        Assert.Fail("Batch failed");
                    }
                }


            }
            catch (Exception ex)
            {
                Assert.Fail(ex.ToString());
            }
        }

        // Issue 1958
        [Test]
        public async Task ValidateCosmosInsertOrMergeInBatch()
        {
            var storageAccount = CloudStorageAccount.Parse("UseDevelopmentStorage=true");
            var tableClient = storageAccount.CreateCloudTableClient();

            var client = tableClient.GetTableReference("foo");
            client.CreateIfNotExists();

            var batch = new TableBatchOperation
            {
                TableOperation.InsertOrMerge(new DynamicTableEntity("foo", "c8b06c47-c755-4b53-b3da-73949ebbb24f")),
                TableOperation.InsertOrMerge(new DynamicTableEntity("foo", "08667dfd-d2e0-4e20-a51e-7bc13d01c89c"))
            };

            // This used to error with a 500 response
            var result = await client.ExecuteBatchAsync(batch);
            if (result[0].HttpStatusCode != 204 || result[1].HttpStatusCode != 204)
            {
                Assert.Fail("Expected 204 response");
            }
            // clean up
            client.DeleteIfExists();
        }
    }
}
