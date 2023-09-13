using System;
using System.Collections.Generic;
using System.Text;
using NUnit.Framework;
using System.Threading.Tasks;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Table;
using System.Collections;
using System.Linq;

namespace AzuriteTableTest
{
    [TestFixture]
    public class AzureStorageTests
    {
        private CloudStorageAccount account;

        [SetUp]
        public void SetUp()
        {
            account = CloudStorageAccount.Parse("UseDevelopmentStorage=true");
        }

        // Generic test for Azure Storage SDK
        [Test]
        public async Task BasicAzureStorageSDKTest()
        {

            var client = account.CreateCloudTableClient();
            var table = client.GetTableReference("testtable");
            var pk = Guid.NewGuid().ToString();

            var data = new TestTableEntity(1);
            data.PartitionKey = pk;
            data.RowKey = "row";

            await table.CreateIfNotExistsAsync();
            var insertResult = await table.ExecuteAsync(TableOperation.InsertOrReplace(data));
            var queryResult = await table.ExecuteQuerySegmentedAsync<TestTableEntity>(
                new TableQuery<TestTableEntity>().Where("Value eq 1"), //.Take(1),
                null
                );

            var insertedData = insertResult.Result as TestTableEntity;

            Assert.Greater(queryResult.Results.Count, 0);
            var retrievedData = queryResult.Results.Single();
            Console.WriteLine($"Insert: {insertResult.HttpStatusCode}, {insertedData.PartitionKey}, {insertedData.RowKey}, {insertedData.Value}");
            Console.WriteLine($"Query: {retrievedData.PartitionKey}, {retrievedData.RowKey}, {retrievedData.Value}");

            Assert.AreEqual(insertedData.Value, retrievedData.Value);

        }

        // Issue 1929
        [Test]
        public async Task EmptyFieldsShouldNotBeReturned()
        {

            var client = account.CreateCloudTableClient();
            var table = client.GetTableReference("testtable");

            await table.CreateIfNotExistsAsync();

            var pk = Guid.NewGuid().ToString();

            // Only this value should be returned
            var nonNullValue = new TestTableEntityString
            {
                PartitionKey = pk,
                RowKey = "a",
                Value = "TestValue"
            };
            await table.ExecuteAsync(TableOperation.InsertOrReplace(nonNullValue));

            var nullValue = new TestTableEntityString
            {
                PartitionKey = pk,
                RowKey = "b"
            };
            await table.ExecuteAsync(TableOperation.InsertOrReplace(nullValue));

            var emptyString = new TestTableEntityString
            {
                PartitionKey = pk,
                RowKey = "c"
            };
            await table.ExecuteAsync(TableOperation.InsertOrReplace(emptyString));

            try
            {
                var queryResult = await table.ExecuteQuerySegmentedAsync<TestTableEntityString>(
                    new TableQuery<TestTableEntityString>().Where($"PartitionKey eq '{pk}' and Value ne ''"),
                    null);

                Assert.AreEqual(queryResult.Results.Count, 1);
                var onlyResult = queryResult.Results.First();
                Assert.AreEqual(onlyResult.PartitionKey, pk);
                Assert.AreEqual(onlyResult.RowKey, "a");
                Assert.AreEqual(onlyResult.Value, "TestValue");

            }
            catch (Exception e)
            {
                Assert.Fail(e.Message);
            }
        }
    }
}
