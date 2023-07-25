using Azure.Data.Tables;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Table;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AzuriteTableTest
{
    internal static class TestForIssue1929
    {
        internal static async Task RunTest()
        {
            var account = CloudStorageAccount.Parse("UseDevelopmentStorage=true");
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

                if (queryResult.Results.Count > 0)
                {
                    if (queryResult.Results.Count > 1)
                    {
                        foreach (var result in queryResult.Results)
                        {
                            Console.WriteLine($"Partition Key {result.PartitionKey}, Row Key {result.RowKey}, Value : {result.Value}");
                        }
                        throw new Exception("Error, found too many results");
                    }
                    var onlyResult = queryResult.Results.First();
                    Console.WriteLine($"Found only 1 result: PK {onlyResult.PartitionKey}, RK {onlyResult.RowKey}, Val {onlyResult.Value}");
                }
                else
                {
                    throw new Exception("No results returned");
                }
            }
            catch(Exception e)
            {
                Console.WriteLine($"Exception {e}");
            }
            finally
            {
                await table.DeleteIfExistsAsync();
            }
        }
    }
}
