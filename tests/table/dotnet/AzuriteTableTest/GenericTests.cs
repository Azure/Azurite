using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Table;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AzuriteTableTest
{
    internal static class GenericTests
    {
        internal async static Task RunTest1()
        {
            
                var account = CloudStorageAccount.Parse("UseDevelopmentStorage=true");
                var client = account.CreateCloudTableClient();
                var table = client.GetTableReference("testtable");

                var data = new TestTableEntity(1);
                data.PartitionKey = "PARTITION";
                data.RowKey = "ROW";

                await table.CreateIfNotExistsAsync();
                var insertResult = await table.ExecuteAsync(TableOperation.InsertOrReplace(data));
                var queryResult = await table.ExecuteQuerySegmentedAsync<TestTableEntity>(
                    new TableQuery<TestTableEntity>().Where("Value eq 1"), //.Take(1),
                    null
                    );

                var insertedData = insertResult.Result as TestTableEntity;
                if (queryResult.Results.Count > 0)
                {
                    var retrievedData = queryResult.Results.Single();
                    Console.WriteLine($"Insert: {insertResult.HttpStatusCode}, {insertedData.PartitionKey}, {insertedData.RowKey}, {insertedData.Value}");
                    Console.WriteLine($"Query: {retrievedData.PartitionKey}, {retrievedData.RowKey}, {retrievedData.Value}");

                    if (insertedData.Value != retrievedData.Value)
                    {
                        throw new Exception("Values differ");
                    }
                }
                else
                {
                    Console.WriteLine("results empty!");
                }
            }
        
    }
}
